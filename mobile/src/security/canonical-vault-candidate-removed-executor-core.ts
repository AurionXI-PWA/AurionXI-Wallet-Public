import type { CanonicalVaultMigrationJournal } from './canonical-vault-migration-journal-core';
import {
  planCanonicalVaultMigration,
  type CanonicalVaultMigrationSnapshot,
} from './canonical-vault-migration-policy';

export type CanonicalVaultCandidateRemovedExecutorDependencies = {
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

export async function executeCanonicalVaultCandidateRemovedAdvance(
  dependencies: CanonicalVaultCandidateRemovedExecutorDependencies,
): Promise<{ action: 'candidate-removed-recorded' }> {
  const snapshot = await dependencies.readSnapshot();
  const plan = planCanonicalVaultMigration(snapshot);
  if (
    plan.action !== 'mark-candidate-removed' ||
    plan.state !== 'candidate-absent' ||
    snapshot.candidate !== null ||
    !snapshot.primary ||
    snapshot.activeSlot?.activeSlot !== 'primary' ||
    !snapshot.migrationJournal ||
    snapshot.migrationJournal.phase !== 'primary-authoritative'
  ) {
    throw new Error('Canonical candidate-removed advance is not eligible.');
  }

  const next: CanonicalVaultMigrationJournal = {
    ...snapshot.migrationJournal,
    phase: 'candidate-removed',
  };
  const stored = await dependencies.writeJournalVerified(next);
  if (!journalsMatch(stored, next)) {
    throw new Error('Canonical candidate-removed phase failed verified storage.');
  }

  const verifiedSnapshot = await dependencies.readSnapshot();
  const verifiedPlan = planCanonicalVaultMigration(verifiedSnapshot);
  if (
    verifiedSnapshot.candidate !== null ||
    verifiedSnapshot.primary === null ||
    verifiedSnapshot.activeSlot?.activeSlot !== 'primary' ||
    verifiedPlan.action !== 'mark-finalized' ||
    verifiedPlan.state !== 'candidate-removed'
  ) {
    throw new Error('Canonical candidate-removed phase failed fresh snapshot verification.');
  }
  return { action: 'candidate-removed-recorded' };
}

