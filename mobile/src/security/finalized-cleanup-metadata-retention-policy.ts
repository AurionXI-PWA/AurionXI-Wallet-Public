import type { RetiredPrimaryCleanupPreDeletionAudit } from './retired-primary-cleanup-pre-deletion-audit-core';
import type { VaultActiveSlotRecord } from './vault-active-slot-core';
import type { VaultReplacementRecoveryAudit } from './vault-replacement-journal-core';

export type FinalizedCleanupMetadataRetentionSnapshot = {
  activeSlot: VaultActiveSlotRecord | null;
  cleanupAudit: RetiredPrimaryCleanupPreDeletionAudit;
  replacementAudit: VaultReplacementRecoveryAudit;
};

export type FinalizedCleanupMetadataRetentionPlan =
  | {
      action: 'retain-finalized-authority-evidence';
      prerequisite: 'canonicalize-active-vault-before-compaction';
      state: 'finalized-retained';
    }
  | { action: 'retain-unfinished-recovery-evidence'; state: 'recovery-incomplete' }
  | { action: 'fail-closed'; state: 'inconsistent' };

/**
 * Pure policy only. It intentionally exposes no delete or write operation.
 *
 * A finalized cleanup journal still participates in proving why the candidate
 * slot is authoritative after the retired primary was removed. Metadata must
 * remain until a separate, durable canonical-vault migration eliminates that
 * dependency and is independently verified.
 */
export function planFinalizedCleanupMetadataRetention(
  snapshot: FinalizedCleanupMetadataRetentionSnapshot,
): FinalizedCleanupMetadataRetentionPlan {
  const { activeSlot, cleanupAudit, replacementAudit } = snapshot;

  if (
    activeSlot?.activeSlot === 'candidate' &&
    replacementAudit.state === 'cleanup-pending' &&
    replacementAudit.action === 'await-cleanup' &&
    cleanupAudit.state === 'finalized' &&
    cleanupAudit.action === 'complete'
  ) {
    return {
      action: 'retain-finalized-authority-evidence',
      prerequisite: 'canonicalize-active-vault-before-compaction',
      state: 'finalized-retained',
    };
  }

  if (
    activeSlot?.activeSlot === 'candidate' &&
    replacementAudit.state === 'cleanup-pending' &&
    replacementAudit.action === 'await-cleanup' &&
    cleanupAudit.action !== 'fail-closed' &&
    cleanupAudit.state !== 'inconsistent'
  ) {
    return { action: 'retain-unfinished-recovery-evidence', state: 'recovery-incomplete' };
  }

  return { action: 'fail-closed', state: 'inconsistent' };
}
