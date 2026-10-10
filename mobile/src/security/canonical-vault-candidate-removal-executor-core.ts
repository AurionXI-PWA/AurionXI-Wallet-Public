import {
  planCanonicalVaultMigration,
  type CanonicalVaultMigrationSnapshot,
} from './canonical-vault-migration-policy';

export type CanonicalVaultCandidateRemovalExecutorDependencies = {
  deleteCandidate: () => Promise<void>;
  readSnapshot: () => Promise<CanonicalVaultMigrationSnapshot>;
};

export async function executeVerifiedCanonicalVaultCandidateRemoval(
  dependencies: CanonicalVaultCandidateRemovalExecutorDependencies,
): Promise<{ action: 'candidate-removed' }> {
  const snapshot = await dependencies.readSnapshot();
  const plan = planCanonicalVaultMigration(snapshot);
  if (
    plan.action !== 'remove-candidate' ||
    plan.state !== 'primary-authoritative' ||
    !snapshot.candidate ||
    !snapshot.primary ||
    snapshot.activeSlot?.activeSlot !== 'primary' ||
    snapshot.migrationJournal?.phase !== 'primary-authoritative'
  ) {
    throw new Error('Canonical candidate removal is not eligible.');
  }

  await dependencies.deleteCandidate();

  const verifiedSnapshot = await dependencies.readSnapshot();
  const verifiedPlan = planCanonicalVaultMigration(verifiedSnapshot);
  if (
    verifiedSnapshot.candidate !== null ||
    verifiedSnapshot.primary === null ||
    verifiedSnapshot.activeSlot?.activeSlot !== 'primary' ||
    verifiedPlan.action !== 'mark-candidate-removed' ||
    verifiedPlan.state !== 'candidate-absent'
  ) {
    throw new Error('Canonical candidate removal failed empty and authority read-back verification.');
  }
  return { action: 'candidate-removed' };
}

