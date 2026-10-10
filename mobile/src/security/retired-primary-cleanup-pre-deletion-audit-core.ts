import {
  planRetiredPrimaryCleanup,
  retiredPrimaryCleanupJournalMatchesStableScope,
  type RetiredPrimaryCleanupSnapshot,
} from './retired-primary-cleanup-policy';

export type RetiredPrimaryCleanupPreDeletionAudit = {
  action: 'await-authenticated-cleanup' | 'resume-cleanup' | 'advance-journal' | 'complete' | 'fail-closed';
  state: 'no-intent' | 'intent-primary-present' | 'intent-primary-absent' | 'primary-removed' | 'finalized' | 'inconsistent';
};

function retiredPrimaryMatchesIntent(snapshot: RetiredPrimaryCleanupSnapshot): boolean {
  const journal = snapshot.cleanupJournal;
  if (!journal || snapshot.retiredPrimaryStatus !== journal.retiredPrimaryStatus) return false;
  if (journal.retiredPrimaryStatus === 'corrupt') return snapshot.retiredPrimary === null;
  return !!snapshot.retiredPrimary &&
    snapshot.retiredPrimary.publicAddress.toLowerCase() === journal.retiredIdentity.publicAddress.toLowerCase() &&
    snapshot.retiredPrimary.createdAt === journal.retiredIdentity.vaultCreatedAt;
}

export function auditRetiredPrimaryCleanupPreDeletion(
  snapshot: RetiredPrimaryCleanupSnapshot,
): RetiredPrimaryCleanupPreDeletionAudit {
  const journal = snapshot.cleanupJournal;
  if (!journal) {
    return planRetiredPrimaryCleanup(snapshot).action === 'require-authenticated-cleanup'
      ? { action: 'await-authenticated-cleanup', state: 'no-intent' }
      : { action: 'fail-closed', state: 'inconsistent' };
  }
  if (!retiredPrimaryCleanupJournalMatchesStableScope(snapshot, journal)) {
    return { action: 'fail-closed', state: 'inconsistent' };
  }
  if (journal.phase === 'intent-recorded') {
    if (retiredPrimaryMatchesIntent(snapshot)) {
      return { action: 'resume-cleanup', state: 'intent-primary-present' };
    }
    return snapshot.retiredPrimaryStatus === 'empty' && snapshot.retiredPrimary === null
      ? { action: 'advance-journal', state: 'intent-primary-absent' }
      : { action: 'fail-closed', state: 'inconsistent' };
  }
  if (snapshot.retiredPrimaryStatus !== 'empty' || snapshot.retiredPrimary !== null) {
    return { action: 'fail-closed', state: 'inconsistent' };
  }
  return journal.phase === 'primary-removed'
    ? { action: 'advance-journal', state: 'primary-removed' }
    : { action: 'complete', state: 'finalized' };
}
