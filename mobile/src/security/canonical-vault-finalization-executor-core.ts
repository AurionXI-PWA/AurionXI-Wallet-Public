import type { CanonicalVaultMigrationJournal } from './canonical-vault-migration-journal-core';
import {
  planCanonicalVaultMigration,
  type CanonicalVaultMigrationSnapshot,
} from './canonical-vault-migration-policy';

export type CanonicalVaultFinalizationExecutorDependencies = {
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

export async function executeCanonicalVaultMigrationFinalization(
  dependencies: CanonicalVaultFinalizationExecutorDependencies,
): Promise<{ action: 'migration-finalized' }> {
  const snapshot = await dependencies.readSnapshot();
  const plan = planCanonicalVaultMigration(snapshot);
  if (
    plan.action !== 'mark-finalized' ||
    plan.state !== 'candidate-removed' ||
    snapshot.candidate !== null ||
    !snapshot.primary ||
    snapshot.activeSlot?.activeSlot !== 'primary' ||
    !snapshot.migrationJournal ||
    snapshot.migrationJournal.phase !== 'candidate-removed'
  ) {
    throw new Error('Canonical vault migration finalization is not eligible.');
  }

  const next: CanonicalVaultMigrationJournal = {
    ...snapshot.migrationJournal,
    phase: 'finalized',
  };
  const stored = await dependencies.writeJournalVerified(next);
  if (!journalsMatch(stored, next)) {
    throw new Error('Canonical vault migration finalization failed verified storage.');
  }

  const verifiedSnapshot = await dependencies.readSnapshot();
  const verifiedPlan = planCanonicalVaultMigration(verifiedSnapshot);
  if (
    verifiedSnapshot.candidate !== null ||
    verifiedSnapshot.primary === null ||
    verifiedSnapshot.activeSlot?.activeSlot !== 'primary' ||
    verifiedPlan.action !== 'complete' ||
    verifiedPlan.state !== 'finalized'
  ) {
    throw new Error('Canonical vault migration finalization failed complete read-back verification.');
  }
  return { action: 'migration-finalized' };
}

