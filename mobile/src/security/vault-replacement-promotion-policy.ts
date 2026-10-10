import type { VaultV3Envelope } from './vault-envelope-v3';
import type { VaultActiveSlotRecord } from './vault-active-slot-core';
import type { VaultReplacementJournal } from './vault-replacement-journal-core';
import type { VaultReplacementResumeState } from './vault-replacement-resume-policy';
import { canResumeVaultReplacementCandidate } from './vault-replacement-resume-policy';

export type VaultReplacementPromotionSnapshot = {
  activeSlot: VaultActiveSlotRecord | null;
  candidate: VaultV3Envelope | null;
  journal: VaultReplacementJournal | null;
  primaryStatus: 'present' | 'corrupt';
};

export type VaultReplacementPromotionPlan = {
  action:
    | 'write-promotion-started'
    | 'activate-candidate-pointer'
    | 'write-candidate-authoritative'
    | 'write-cleanup-pending'
    | 'await-authenticated-cleanup'
    | 'fail-closed';
  state: 'ready' | 'intent-recorded' | 'candidate-active' | 'authoritative' | 'cleanup-pending' | 'inconsistent';
};

function candidateMatchesJournal(
  candidate: VaultV3Envelope | null,
  journal: VaultReplacementJournal | null,
): candidate is VaultV3Envelope {
  return !!candidate && !!journal &&
    candidate.publicAddress.toLowerCase() === journal.candidatePublicAddress.toLowerCase();
}

function isPrimaryActive(record: VaultActiveSlotRecord | null): boolean {
  return record === null || record.activeSlot === 'primary';
}

function isCandidateActive(record: VaultActiveSlotRecord | null, transactionId: string): boolean {
  return record?.activeSlot === 'candidate' && record.transactionId === transactionId;
}

export function planVaultReplacementPromotion(
  snapshot: VaultReplacementPromotionSnapshot,
  authorization: VaultReplacementResumeState,
  now: number,
): VaultReplacementPromotionPlan {
  const { activeSlot, candidate, journal, primaryStatus } = snapshot;
  if (!journal || !candidateMatchesJournal(candidate, journal) || journal.targetStatus !== primaryStatus) {
    return { action: 'fail-closed', state: 'inconsistent' };
  }

  if (journal.phase === 'candidate-verified') {
    if (
      !isPrimaryActive(activeSlot) ||
      !canResumeVaultReplacementCandidate(authorization, journal, now)
    ) {
      return { action: 'fail-closed', state: 'inconsistent' };
    }
    return { action: 'write-promotion-started', state: 'ready' };
  }

  if (journal.phase === 'promotion-started') {
    if (isPrimaryActive(activeSlot)) {
      return { action: 'activate-candidate-pointer', state: 'intent-recorded' };
    }
    if (isCandidateActive(activeSlot, journal.transactionId)) {
      return { action: 'write-candidate-authoritative', state: 'candidate-active' };
    }
    return { action: 'fail-closed', state: 'inconsistent' };
  }

  if (journal.phase === 'candidate-authoritative') {
    return isCandidateActive(activeSlot, journal.transactionId)
      ? { action: 'write-cleanup-pending', state: 'authoritative' }
      : { action: 'fail-closed', state: 'inconsistent' };
  }

  if (journal.phase === 'cleanup-pending') {
    return isCandidateActive(activeSlot, journal.transactionId)
      ? { action: 'await-authenticated-cleanup', state: 'cleanup-pending' }
      : { action: 'fail-closed', state: 'inconsistent' };
  }

  return { action: 'fail-closed', state: 'inconsistent' };
}
