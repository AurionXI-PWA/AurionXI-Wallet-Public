import type { VaultActiveSlotRecord } from './vault-active-slot-core';
import type { VaultReplacementJournal } from './vault-replacement-journal-core';
import type { RetiredPrimaryCleanupJournal } from './retired-primary-cleanup-journal-core';
import { planVaultReplacementPromotion } from './vault-replacement-promotion-policy';
import { INITIAL_VAULT_REPLACEMENT_RESUME_STATE } from './vault-replacement-resume-policy';
import type { VaultV3Envelope } from './vault-envelope-v3';

export type VaultReplacementPromotionRecoverySnapshot = {
  activeSlot: VaultActiveSlotRecord | null;
  candidate: VaultV3Envelope | null;
  journal: VaultReplacementJournal | null;
  cleanupJournal: RetiredPrimaryCleanupJournal | null;
  primaryStatus: 'empty' | 'present' | 'corrupt' | 'unsupported';
};

export type VaultReplacementPromotionRecoveryResult = {
  action:
    | 'none'
    | 'await-authenticated-promotion'
    | 'advance-durable-promotion'
    | 'await-authenticated-cleanup'
    | 'fail-closed';
  state: 'clean' | 'pre-intent' | 'recoverable' | 'cleanup-pending' | 'inconsistent';
};

export type VaultReplacementPromotionRecoveryDependencies = {
  executeDurablePromotionStep: () => Promise<void>;
  readSnapshot: () => Promise<VaultReplacementPromotionRecoverySnapshot>;
};

function isPrimaryPointer(activeSlot: VaultActiveSlotRecord | null): boolean {
  return activeSlot === null || activeSlot.activeSlot === 'primary';
}

function candidateMatchesJournal(
  candidate: VaultV3Envelope | null,
  journal: VaultReplacementJournal,
): boolean {
  return !!candidate &&
    candidate.publicAddress.toLowerCase() === journal.candidatePublicAddress.toLowerCase();
}

function cleanupIntentAllowsEmptyPrimary(
  activeSlot: VaultActiveSlotRecord | null,
  candidate: VaultV3Envelope,
  journal: VaultReplacementJournal,
  cleanupJournal: RetiredPrimaryCleanupJournal | null,
): boolean {
  return activeSlot?.activeSlot === 'candidate' &&
    activeSlot.transactionId === journal.transactionId &&
    !!cleanupJournal &&
    cleanupJournal.replacementTransactionId === journal.transactionId &&
    cleanupJournal.retiredPrimaryStatus === journal.targetStatus &&
    cleanupJournal.activeIdentity.publicAddress.toLowerCase() === candidate.publicAddress.toLowerCase() &&
    cleanupJournal.activeIdentity.vaultCreatedAt === candidate.createdAt;
}

export async function coordinateStartupVaultReplacementPromotionRecovery(
  dependencies: VaultReplacementPromotionRecoveryDependencies,
): Promise<VaultReplacementPromotionRecoveryResult> {
  const snapshot = await dependencies.readSnapshot();
  const { activeSlot, candidate, cleanupJournal, journal, primaryStatus } = snapshot;

  if (!candidate && !journal && isPrimaryPointer(activeSlot)) {
    return { action: 'none', state: 'clean' };
  }
  if (
    !journal ||
    !candidateMatchesJournal(candidate, journal)
  ) {
    return { action: 'fail-closed', state: 'inconsistent' };
  }
  if (journal.phase === 'cleanup-pending') {
    const primaryStillMatchesTarget = primaryStatus === journal.targetStatus;
    const verifiedPostDeletionState = primaryStatus === 'empty' && !!candidate &&
      cleanupIntentAllowsEmptyPrimary(activeSlot, candidate, journal, cleanupJournal);
    return primaryStillMatchesTarget || verifiedPostDeletionState
      ? { action: 'await-authenticated-cleanup', state: 'cleanup-pending' }
      : { action: 'fail-closed', state: 'inconsistent' };
  }
  if (
    (primaryStatus !== 'present' && primaryStatus !== 'corrupt') ||
    journal.targetStatus !== primaryStatus
  ) {
    return { action: 'fail-closed', state: 'inconsistent' };
  }
  if (journal.phase === 'candidate-verified') {
    return isPrimaryPointer(activeSlot)
      ? { action: 'await-authenticated-promotion', state: 'pre-intent' }
      : { action: 'fail-closed', state: 'inconsistent' };
  }

  const plan = planVaultReplacementPromotion(
    { activeSlot, candidate, journal, primaryStatus },
    INITIAL_VAULT_REPLACEMENT_RESUME_STATE,
    Date.now(),
  );
  if (plan.action === 'fail-closed') {
    return { action: 'fail-closed', state: 'inconsistent' };
  }
  await dependencies.executeDurablePromotionStep();
  return { action: 'advance-durable-promotion', state: 'recoverable' };
}
