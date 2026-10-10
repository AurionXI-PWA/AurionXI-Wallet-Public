import type { CanonicalVaultMigrationJournal } from './canonical-vault-migration-journal-core';
import {
  planCanonicalVaultMigration,
  type CanonicalVaultMigrationSnapshot,
} from './canonical-vault-migration-policy';

export type CanonicalVaultPrimaryAuthoritativeExecutorDependencies = {
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

export async function executeCanonicalVaultPrimaryAuthoritativeAdvance(
  dependencies: CanonicalVaultPrimaryAuthoritativeExecutorDependencies,
): Promise<{ action: 'primary-authoritative-recorded' }> {
  const snapshot = await dependencies.readSnapshot();
  const plan = planCanonicalVaultMigration(snapshot);
  if (
    plan.action !== 'mark-primary-authoritative' ||
    plan.state !== 'primary-pointer-active' ||
    !snapshot.migrationJournal ||
    snapshot.migrationJournal.phase !== 'primary-written'
  ) {
    throw new Error('Canonical primary-authoritative advance is not eligible.');
  }

  const next: CanonicalVaultMigrationJournal = {
    ...snapshot.migrationJournal,
    phase: 'primary-authoritative',
  };
  const stored = await dependencies.writeJournalVerified(next);
  if (!journalsMatch(stored, next)) {
    throw new Error('Canonical primary-authoritative phase failed verified storage.');
  }

  const verifiedSnapshot = await dependencies.readSnapshot();
  const verifiedPlan = planCanonicalVaultMigration(verifiedSnapshot);
  if (
    verifiedPlan.action !== 'remove-candidate' ||
    verifiedPlan.state !== 'primary-authoritative'
  ) {
    throw new Error('Canonical primary-authoritative phase failed fresh snapshot verification.');
  }
  return { action: 'primary-authoritative-recorded' };
}

