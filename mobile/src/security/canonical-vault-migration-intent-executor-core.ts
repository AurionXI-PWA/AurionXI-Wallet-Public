import {
  createCanonicalVaultMigrationJournal,
  type CanonicalVaultMigrationJournal,
} from './canonical-vault-migration-journal-core';
import {
  planCanonicalVaultMigration,
  type CanonicalVaultMigrationSnapshot,
} from './canonical-vault-migration-policy';

export type CanonicalVaultMigrationIntentExecutorDependencies = {
  readSnapshot: () => Promise<CanonicalVaultMigrationSnapshot>;
  writeJournalVerified: (
    journal: CanonicalVaultMigrationJournal,
  ) => Promise<CanonicalVaultMigrationJournal>;
};

function journalsMatch(
  left: CanonicalVaultMigrationJournal,
  right: CanonicalVaultMigrationJournal,
): boolean {
  return left.format === right.format &&
    left.createdAt === right.createdAt &&
    left.phase === right.phase &&
    left.replacementTransactionId === right.replacementTransactionId &&
    left.candidatePublicAddress.toLowerCase() === right.candidatePublicAddress.toLowerCase() &&
    left.candidateCreatedAt === right.candidateCreatedAt;
}

export async function executeCanonicalVaultMigrationIntent(
  createdAt: string,
  dependencies: CanonicalVaultMigrationIntentExecutorDependencies,
): Promise<{ action: 'intent-recorded' }> {
  const snapshot = await dependencies.readSnapshot();
  const plan = planCanonicalVaultMigration(snapshot);
  if (
    plan.action !== 'record-intent' ||
    plan.state !== 'eligible' ||
    !snapshot.candidate ||
    !snapshot.replacementJournal
  ) {
    throw new Error('Canonical vault migration intent is not eligible.');
  }

  const journal = createCanonicalVaultMigrationJournal(
    snapshot.candidate.publicAddress,
    snapshot.candidate.createdAt,
    snapshot.replacementJournal.transactionId,
    createdAt,
  );
  const stored = await dependencies.writeJournalVerified(journal);
  if (!journalsMatch(stored, journal)) {
    throw new Error('Canonical vault migration intent failed verified storage.');
  }

  const verifiedSnapshot = await dependencies.readSnapshot();
  const verifiedPlan = planCanonicalVaultMigration(verifiedSnapshot);
  if (verifiedPlan.action !== 'write-primary-copy' || verifiedPlan.state !== 'intent-recorded') {
    throw new Error('Canonical vault migration intent failed fresh snapshot verification.');
  }
  return { action: 'intent-recorded' };
}

