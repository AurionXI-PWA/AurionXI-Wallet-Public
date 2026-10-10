import type { CanonicalVaultMigrationJournal } from './canonical-vault-migration-journal-core';
import {
  planCanonicalVaultMigration,
  type CanonicalVaultMigrationSnapshot,
} from './canonical-vault-migration-policy';

export type CanonicalVaultPrimaryWrittenExecutorDependencies = {
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

export async function executeCanonicalVaultPrimaryWrittenAdvance(
  dependencies: CanonicalVaultPrimaryWrittenExecutorDependencies,
): Promise<{ action: 'primary-written-recorded' }> {
  const snapshot = await dependencies.readSnapshot();
  const plan = planCanonicalVaultMigration(snapshot);
  if (
    plan.action !== 'mark-primary-written' ||
    plan.state !== 'primary-copy-present' ||
    !snapshot.migrationJournal ||
    snapshot.migrationJournal.phase !== 'intent-recorded'
  ) {
    throw new Error('Canonical primary-written advance is not eligible.');
  }

  const next: CanonicalVaultMigrationJournal = {
    ...snapshot.migrationJournal,
    phase: 'primary-written',
  };
  const stored = await dependencies.writeJournalVerified(next);
  if (!journalsMatch(stored, next)) {
    throw new Error('Canonical primary-written phase failed verified storage.');
  }

  const verifiedSnapshot = await dependencies.readSnapshot();
  const verifiedPlan = planCanonicalVaultMigration(verifiedSnapshot);
  if (
    verifiedPlan.action !== 'activate-primary-pointer' ||
    verifiedPlan.state !== 'primary-written'
  ) {
    throw new Error('Canonical primary-written phase failed fresh snapshot verification.');
  }
  return { action: 'primary-written-recorded' };
}

