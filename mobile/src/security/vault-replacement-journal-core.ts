import type { VaultV3Envelope } from './vault-envelope-v3';

export type VaultReplacementJournal = {
  candidatePublicAddress: `0x${string}`;
  createdAt: string;
  format: 'aurionxi-vault-replacement-journal-v1';
  phase: 'candidate-verified' | 'promotion-started' | 'candidate-authoritative' | 'cleanup-pending';
  targetStatus: 'present' | 'corrupt';
  transactionId: string;
};

export type VaultReplacementRecoveryAudit = {
  action: 'none' | 'resume-candidate' | 'continue-promotion' | 'await-cleanup' | 'quarantine-candidate' | 'remove-stale-journal' | 'fail-closed';
  state: 'clean' | 'resumable' | 'promotion-recovery' | 'cleanup-pending' | 'candidate-without-journal' | 'journal-without-candidate' | 'inconsistent';
};

export function isVaultReplacementJournal(value: unknown): value is VaultReplacementJournal {
  if (!value || typeof value !== 'object') return false;
  const journal = value as Partial<VaultReplacementJournal>;
  const keys = Object.keys(journal).sort();
  const expectedKeys = [
    'candidatePublicAddress',
    'createdAt',
    'format',
    'phase',
    'targetStatus',
    'transactionId',
  ];
  return keys.length === expectedKeys.length &&
    keys.every((key, index) => key === expectedKeys[index]) &&
    journal.format === 'aurionxi-vault-replacement-journal-v1' &&
    typeof journal.transactionId === 'string' && /^[a-f0-9]{32}$/.test(journal.transactionId) &&
    typeof journal.createdAt === 'string' && !Number.isNaN(Date.parse(journal.createdAt)) &&
    typeof journal.candidatePublicAddress === 'string' && /^0x[a-fA-F0-9]{40}$/.test(journal.candidatePublicAddress) &&
    (journal.targetStatus === 'present' || journal.targetStatus === 'corrupt') &&
    (
      journal.phase === 'candidate-verified' ||
      journal.phase === 'promotion-started' ||
      journal.phase === 'candidate-authoritative' ||
      journal.phase === 'cleanup-pending'
    );
}

export function createVerifiedCandidateJournal(
  candidate: VaultV3Envelope,
  targetStatus: 'present' | 'corrupt',
  transactionId: string,
  createdAt: string,
): VaultReplacementJournal {
  const journal: VaultReplacementJournal = {
    candidatePublicAddress: candidate.publicAddress,
    createdAt,
    format: 'aurionxi-vault-replacement-journal-v1',
    phase: 'candidate-verified',
    targetStatus,
    transactionId,
  };
  if (!isVaultReplacementJournal(journal)) throw new Error('Vault replacement journal is invalid.');
  return journal;
}

export function auditVaultReplacementRecovery(
  candidate: VaultV3Envelope | null,
  journal: VaultReplacementJournal | null,
): VaultReplacementRecoveryAudit {
  if (!candidate && !journal) return { action: 'none', state: 'clean' };
  if (candidate && !journal) {
    return { action: 'quarantine-candidate', state: 'candidate-without-journal' };
  }
  if (!candidate && journal) {
    return { action: 'remove-stale-journal', state: 'journal-without-candidate' };
  }
  if (
    candidate && journal &&
    candidate.publicAddress.toLowerCase() === journal.candidatePublicAddress.toLowerCase()
  ) {
    if (journal.phase === 'candidate-verified') {
      return { action: 'resume-candidate', state: 'resumable' };
    }
    if (journal.phase === 'cleanup-pending') {
      return { action: 'await-cleanup', state: 'cleanup-pending' };
    }
    return { action: 'continue-promotion', state: 'promotion-recovery' };
  }
  return { action: 'fail-closed', state: 'inconsistent' };
}
