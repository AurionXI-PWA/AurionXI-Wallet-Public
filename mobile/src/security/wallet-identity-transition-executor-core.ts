import type { VaultActiveSlotRecord } from './vault-active-slot-core';
import type { VaultV3Envelope } from './vault-envelope-v3';
import type { VaultReplacementJournal } from './vault-replacement-journal-core';
import {
  canExecuteWalletIdentityTransition,
  type WalletIdentityTransitionAuthorization,
} from './wallet-identity-transition-authorization';
import {
  createWalletIdentityTransitionJournal,
  type WalletIdentityTransitionJournal,
} from './wallet-identity-transition-journal-core';
import {
  planWalletIdentityTransition,
  type WalletIdentityTransitionSnapshot,
} from './wallet-identity-transition-policy';
import type { WalletIdentityRecord } from './wallet-identity-record-core';

export type WalletIdentityTransitionExecutorSnapshot = {
  activeSlot: VaultActiveSlotRecord | null;
  activeVault: VaultV3Envelope | null;
  identity: WalletIdentityRecord | null;
  replacementJournal: VaultReplacementJournal | null;
  transitionJournal: WalletIdentityTransitionJournal | null;
};

export type WalletIdentityTransitionExecutorDependencies = {
  readIdentity: () => Promise<WalletIdentityRecord | null>;
  readSnapshot: () => Promise<WalletIdentityTransitionExecutorSnapshot>;
  writeIdentity: (identity: WalletIdentityRecord) => Promise<void>;
  writeJournalVerified: (
    journal: WalletIdentityTransitionJournal,
  ) => Promise<WalletIdentityTransitionJournal>;
};

export type WalletIdentityTransitionExecutionResult = {
  action:
    | 'write-intent'
    | 'write-next-identity'
    | 'mark-identity-written'
    | 'mark-identity-verified'
    | 'complete';
};

function identitiesMatch(
  left: WalletIdentityRecord | null,
  right: WalletIdentityRecord,
): boolean {
  return !!left &&
    left.format === right.format &&
    left.derivationPath === right.derivationPath &&
    left.publicAddress.toLowerCase() === right.publicAddress.toLowerCase() &&
    left.vaultCreatedAt === right.vaultCreatedAt;
}

function journalMatchesReplacement(
  snapshot: WalletIdentityTransitionExecutorSnapshot,
  journal: WalletIdentityTransitionJournal,
): boolean {
  const { activeSlot, activeVault, replacementJournal } = snapshot;
  return activeSlot?.activeSlot === 'candidate' &&
    !!activeVault &&
    !!replacementJournal &&
    replacementJournal.phase === 'cleanup-pending' &&
    activeSlot.transactionId === replacementJournal.transactionId &&
    journal.replacementTransactionId === replacementJournal.transactionId &&
    activeVault.publicAddress.toLowerCase() === replacementJournal.candidatePublicAddress.toLowerCase() &&
    identitiesMatch(journal.nextIdentity, {
      ...journal.nextIdentity,
      publicAddress: activeVault.publicAddress,
      vaultCreatedAt: activeVault.createdAt,
    });
}

async function writeJournalPhase(
  journal: WalletIdentityTransitionJournal,
  phase: WalletIdentityTransitionJournal['phase'],
  dependencies: WalletIdentityTransitionExecutorDependencies,
): Promise<void> {
  await dependencies.writeJournalVerified({ ...journal, phase });
}

export async function executeNextWalletIdentityTransitionStep(
  authorization: WalletIdentityTransitionAuthorization,
  dependencies: WalletIdentityTransitionExecutorDependencies,
  now = Date.now(),
): Promise<WalletIdentityTransitionExecutionResult> {
  const snapshot = await dependencies.readSnapshot();
  const journal = snapshot.transitionJournal;

  if (!journal) {
    const planSnapshot: WalletIdentityTransitionSnapshot = snapshot;
    const plan = planWalletIdentityTransition(planSnapshot);
    if (!canExecuteWalletIdentityTransition(authorization, plan, now) || plan.action !== 'require-authenticated-transition') {
      throw new Error('Wallet identity transition authorization is invalid, expired, or stale.');
    }
    await dependencies.writeJournalVerified(createWalletIdentityTransitionJournal(
      plan.scope.previousIdentity,
      plan.scope.nextIdentity,
      plan.scope.replacementTransactionId,
      new Date(now).toISOString(),
    ));
    return { action: 'write-intent' };
  }

  if (!journalMatchesReplacement(snapshot, journal)) {
    throw new Error('Wallet identity transition state is inconsistent.');
  }
  if (journal.phase === 'intent-recorded') {
    if (identitiesMatch(snapshot.identity, journal.previousIdentity)) {
      await dependencies.writeIdentity(journal.nextIdentity);
      const stored = await dependencies.readIdentity();
      if (!identitiesMatch(stored, journal.nextIdentity)) {
        throw new Error('Wallet identity failed transition read-back verification.');
      }
      return { action: 'write-next-identity' };
    }
    if (identitiesMatch(snapshot.identity, journal.nextIdentity)) {
      await writeJournalPhase(journal, 'identity-written', dependencies);
      return { action: 'mark-identity-written' };
    }
    throw new Error('Wallet identity transition state is inconsistent.');
  }
  if (!identitiesMatch(snapshot.identity, journal.nextIdentity)) {
    throw new Error('Wallet identity transition state is inconsistent.');
  }
  if (journal.phase === 'identity-written') {
    await writeJournalPhase(journal, 'identity-verified', dependencies);
    return { action: 'mark-identity-verified' };
  }
  return { action: 'complete' };
}
