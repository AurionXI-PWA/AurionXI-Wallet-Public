export type CanonicalVaultMigrationPhase =
  | 'intent-recorded'
  | 'primary-written'
  | 'primary-authoritative'
  | 'candidate-removed'
  | 'finalized';

export type CanonicalVaultMigrationJournal = {
  candidateCreatedAt: string;
  candidatePublicAddress: `0x${string}`;
  createdAt: string;
  format: 'aurionxi-canonical-vault-migration-v1';
  phase: CanonicalVaultMigrationPhase;
  replacementTransactionId: string;
};

export function isCanonicalVaultMigrationJournal(
  value: unknown,
): value is CanonicalVaultMigrationJournal {
  if (!value || typeof value !== 'object') return false;
  const journal = value as Partial<CanonicalVaultMigrationJournal>;
  const keys = Object.keys(journal).sort();
  const expectedKeys = [
    'candidateCreatedAt',
    'candidatePublicAddress',
    'createdAt',
    'format',
    'phase',
    'replacementTransactionId',
  ];
  return keys.length === expectedKeys.length &&
    keys.every((key, index) => key === expectedKeys[index]) &&
    journal.format === 'aurionxi-canonical-vault-migration-v1' &&
    typeof journal.createdAt === 'string' && !Number.isNaN(Date.parse(journal.createdAt)) &&
    typeof journal.candidateCreatedAt === 'string' && !Number.isNaN(Date.parse(journal.candidateCreatedAt)) &&
    typeof journal.candidatePublicAddress === 'string' && /^0x[a-fA-F0-9]{40}$/.test(journal.candidatePublicAddress) &&
    typeof journal.replacementTransactionId === 'string' && /^[a-f0-9]{32}$/.test(journal.replacementTransactionId) &&
    (
      journal.phase === 'intent-recorded' ||
      journal.phase === 'primary-written' ||
      journal.phase === 'primary-authoritative' ||
      journal.phase === 'candidate-removed' ||
      journal.phase === 'finalized'
    );
}

export function createCanonicalVaultMigrationJournal(
  candidatePublicAddress: `0x${string}`,
  candidateCreatedAt: string,
  replacementTransactionId: string,
  createdAt: string,
): CanonicalVaultMigrationJournal {
  const journal: CanonicalVaultMigrationJournal = {
    candidateCreatedAt,
    candidatePublicAddress,
    createdAt,
    format: 'aurionxi-canonical-vault-migration-v1',
    phase: 'intent-recorded',
    replacementTransactionId,
  };
  if (!isCanonicalVaultMigrationJournal(journal)) {
    throw new Error('The canonical vault migration journal is invalid.');
  }
  return journal;
}
