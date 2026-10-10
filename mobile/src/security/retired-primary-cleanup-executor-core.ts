import {
  canCreateRetiredPrimaryCleanupIntent,
  type RetiredPrimaryCleanupAuthorization,
} from './retired-primary-cleanup-authorization';
import {
  createRetiredPrimaryCleanupJournal,
  type RetiredPrimaryCleanupJournal,
} from './retired-primary-cleanup-journal-core';
import {
  planRetiredPrimaryCleanup,
  retiredPrimaryCleanupJournalMatchesStableScope,
  type RetiredPrimaryCleanupSnapshot,
} from './retired-primary-cleanup-policy';

export type RetiredPrimaryCleanupExecutorDependencies = {
  deleteRetiredPrimary: () => Promise<void>;
  readSnapshot: () => Promise<RetiredPrimaryCleanupSnapshot>;
  writeJournalVerified: (
    journal: RetiredPrimaryCleanupJournal,
  ) => Promise<RetiredPrimaryCleanupJournal>;
};

export type RetiredPrimaryCleanupExecutionResult = {
  action: 'write-intent' | 'remove-retired-primary' | 'mark-primary-removed' | 'mark-finalized' | 'complete';
};

export type RetiredPrimaryCleanupIntentDependencies = Pick<
  RetiredPrimaryCleanupExecutorDependencies,
  'readSnapshot' | 'writeJournalVerified'
>;

export async function recordAuthorizedRetiredPrimaryCleanupIntent(
  authorization: RetiredPrimaryCleanupAuthorization,
  dependencies: RetiredPrimaryCleanupIntentDependencies,
  now = Date.now(),
): Promise<RetiredPrimaryCleanupExecutionResult> {
  const plan = planRetiredPrimaryCleanup(await dependencies.readSnapshot());
  if (!canCreateRetiredPrimaryCleanupIntent(authorization, plan, now) || plan.action !== 'require-authenticated-cleanup') {
    throw new Error('Retired primary cleanup authorization is invalid, expired, or stale.');
  }
  await dependencies.writeJournalVerified(createRetiredPrimaryCleanupJournal(
    plan.scope.retiredIdentity,
    plan.scope.activeIdentity,
    plan.scope.retiredPrimaryStatus,
    plan.scope.replacementTransactionId,
    new Date(now).toISOString(),
  ));
  return { action: 'write-intent' };
}

function identityMatches(
  left: RetiredPrimaryCleanupJournal['activeIdentity'],
  right: RetiredPrimaryCleanupJournal['activeIdentity'],
): boolean {
  return left.derivationPath === right.derivationPath &&
    left.publicAddress.toLowerCase() === right.publicAddress.toLowerCase() &&
    left.vaultCreatedAt === right.vaultCreatedAt;
}

function journalMatchesIntent(
  left: RetiredPrimaryCleanupJournal,
  right: RetiredPrimaryCleanupJournal,
): boolean {
  return left.format === right.format &&
    left.phase === right.phase &&
    left.createdAt === right.createdAt &&
    left.replacementTransactionId === right.replacementTransactionId &&
    left.retiredPrimaryStatus === right.retiredPrimaryStatus &&
    identityMatches(left.retiredIdentity, right.retiredIdentity) &&
    identityMatches(left.activeIdentity, right.activeIdentity);
}

async function writePhase(
  journal: RetiredPrimaryCleanupJournal,
  phase: RetiredPrimaryCleanupJournal['phase'],
  dependencies: RetiredPrimaryCleanupExecutorDependencies,
): Promise<void> {
  await dependencies.writeJournalVerified({ ...journal, phase });
}

export async function executeNextRetiredPrimaryCleanupStep(
  authorization: RetiredPrimaryCleanupAuthorization,
  dependencies: RetiredPrimaryCleanupExecutorDependencies,
  now = Date.now(),
): Promise<RetiredPrimaryCleanupExecutionResult> {
  const snapshot = await dependencies.readSnapshot();
  const journal = snapshot.cleanupJournal;
  if (!journal) {
    const plan = planRetiredPrimaryCleanup(snapshot);
    if (!canCreateRetiredPrimaryCleanupIntent(authorization, plan, now) || plan.action !== 'require-authenticated-cleanup') {
      throw new Error('Retired primary cleanup authorization is invalid, expired, or stale.');
    }
    await dependencies.writeJournalVerified(createRetiredPrimaryCleanupJournal(
      plan.scope.retiredIdentity,
      plan.scope.activeIdentity,
      plan.scope.retiredPrimaryStatus,
      plan.scope.replacementTransactionId,
      new Date(now).toISOString(),
    ));
    return { action: 'write-intent' };
  }

  if (!retiredPrimaryCleanupJournalMatchesStableScope(snapshot, journal)) {
    throw new Error('Retired primary cleanup state is inconsistent.');
  }
  if (journal.phase === 'intent-recorded') {
    if (snapshot.retiredPrimaryStatus === 'empty') {
      await writePhase(journal, 'primary-removed', dependencies);
      return { action: 'mark-primary-removed' };
    }
    const primaryMatchesIntent = snapshot.retiredPrimaryStatus === journal.retiredPrimaryStatus &&
      (
        (journal.retiredPrimaryStatus === 'corrupt' && snapshot.retiredPrimary === null) ||
        (journal.retiredPrimaryStatus === 'present' && !!snapshot.retiredPrimary &&
          snapshot.retiredPrimary.publicAddress.toLowerCase() === journal.retiredIdentity.publicAddress.toLowerCase() &&
          snapshot.retiredPrimary.createdAt === journal.retiredIdentity.vaultCreatedAt)
      );
    if (!primaryMatchesIntent) throw new Error('Retired primary cleanup state is inconsistent.');
    await dependencies.deleteRetiredPrimary();
    const verified = await dependencies.readSnapshot();
    if (
      !verified.cleanupJournal ||
      !journalMatchesIntent(verified.cleanupJournal, journal) ||
      !retiredPrimaryCleanupJournalMatchesStableScope(verified, verified.cleanupJournal) ||
      verified.retiredPrimaryStatus !== 'empty'
    ) {
      throw new Error('Retired primary cleanup failed post-delete verification.');
    }
    return { action: 'remove-retired-primary' };
  }
  if (snapshot.retiredPrimaryStatus !== 'empty') {
    throw new Error('Retired primary cleanup state is inconsistent.');
  }
  if (journal.phase === 'primary-removed') {
    await writePhase(journal, 'finalized', dependencies);
    return { action: 'mark-finalized' };
  }
  return { action: 'complete' };
}
