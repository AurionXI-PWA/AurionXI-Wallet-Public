import { describe, expect, it } from 'vitest';

import { planFinalizedCleanupMetadataRetention } from './finalized-cleanup-metadata-retention-policy';

const candidateSlot = {
  activeSlot: 'candidate',
  format: 'aurionxi-vault-active-slot-v1',
  transactionId: 'a'.repeat(32),
} as const;

describe('finalized cleanup metadata retention policy', () => {
  it('retains finalized journals while the candidate slot depends on their authority chain', () => {
    expect(planFinalizedCleanupMetadataRetention({
      activeSlot: candidateSlot,
      cleanupAudit: { action: 'complete', state: 'finalized' },
      replacementAudit: { action: 'await-cleanup', state: 'cleanup-pending' },
    })).toEqual({
      action: 'retain-finalized-authority-evidence',
      prerequisite: 'canonicalize-active-vault-before-compaction',
      state: 'finalized-retained',
    });
  });

  it.each([
    { action: 'await-authenticated-cleanup', state: 'no-intent' } as const,
    { action: 'resume-cleanup', state: 'intent-primary-present' } as const,
    { action: 'advance-journal', state: 'intent-primary-absent' } as const,
    { action: 'advance-journal', state: 'primary-removed' } as const,
  ])('retains unfinished recovery evidence for $state', (cleanupAudit) => {
    expect(planFinalizedCleanupMetadataRetention({
      activeSlot: candidateSlot,
      cleanupAudit,
      replacementAudit: { action: 'await-cleanup', state: 'cleanup-pending' },
    })).toEqual({ action: 'retain-unfinished-recovery-evidence', state: 'recovery-incomplete' });
  });

  it.each([
    {
      activeSlot: { activeSlot: 'primary', format: 'aurionxi-vault-active-slot-v1' } as const,
      cleanupAudit: { action: 'complete', state: 'finalized' } as const,
      replacementAudit: { action: 'await-cleanup', state: 'cleanup-pending' } as const,
    },
    {
      activeSlot: candidateSlot,
      cleanupAudit: { action: 'fail-closed', state: 'inconsistent' } as const,
      replacementAudit: { action: 'await-cleanup', state: 'cleanup-pending' } as const,
    },
    {
      activeSlot: candidateSlot,
      cleanupAudit: { action: 'complete', state: 'finalized' } as const,
      replacementAudit: { action: 'fail-closed', state: 'inconsistent' } as const,
    },
  ])('fails closed instead of claiming metadata can be compacted', (snapshot) => {
    expect(planFinalizedCleanupMetadataRetention(snapshot)).toEqual({
      action: 'fail-closed',
      state: 'inconsistent',
    });
  });

  it('does not expose a compaction or deletion action in any current result', () => {
    const actions = [
      planFinalizedCleanupMetadataRetention({
        activeSlot: candidateSlot,
        cleanupAudit: { action: 'complete', state: 'finalized' },
        replacementAudit: { action: 'await-cleanup', state: 'cleanup-pending' },
      }).action,
      planFinalizedCleanupMetadataRetention({
        activeSlot: candidateSlot,
        cleanupAudit: { action: 'advance-journal', state: 'primary-removed' },
        replacementAudit: { action: 'await-cleanup', state: 'cleanup-pending' },
      }).action,
    ];
    expect(actions).not.toContain('delete');
    expect(actions).not.toContain('compact');
  });
});
