import type { VaultV3Envelope } from './vault-envelope-v3';
import type { VaultActiveSlotRecord } from './vault-active-slot-core';
import type { VaultReplacementJournal } from './vault-replacement-journal-core';

export type ActiveVaultResolution = {
  slot: 'primary' | 'candidate';
  vault: VaultV3Envelope;
};

export class ActiveVaultResolutionError extends Error {
  constructor() {
    super('The active encrypted wallet could not be resolved safely.');
    this.name = 'ActiveVaultResolutionError';
  }
}

export function resolveActiveVault(
  activeSlot: VaultActiveSlotRecord | null,
  primary: VaultV3Envelope | null,
  candidate: VaultV3Envelope | null,
  journal: VaultReplacementJournal | null,
): ActiveVaultResolution {
  if (!activeSlot || activeSlot.activeSlot === 'primary') {
    if (!primary) throw new ActiveVaultResolutionError();
    return { slot: 'primary', vault: primary };
  }

  const validCandidatePhase = journal?.phase === 'promotion-started' ||
    journal?.phase === 'candidate-authoritative' ||
    journal?.phase === 'cleanup-pending';
  if (
    !candidate ||
    !journal ||
    !validCandidatePhase ||
    activeSlot.transactionId !== journal.transactionId ||
    candidate.publicAddress.toLowerCase() !== journal.candidatePublicAddress.toLowerCase()
  ) {
    throw new ActiveVaultResolutionError();
  }
  return { slot: 'candidate', vault: candidate };
}
