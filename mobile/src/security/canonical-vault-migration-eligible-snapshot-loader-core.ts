import {
  planCanonicalVaultMigration,
  type CanonicalVaultMigrationSnapshot,
} from './canonical-vault-migration-policy';

export async function loadEligibleCanonicalVaultMigrationSnapshotWith(
  readSnapshot: () => Promise<CanonicalVaultMigrationSnapshot>,
): Promise<CanonicalVaultMigrationSnapshot> {
  const snapshot = await readSnapshot();
  const plan = planCanonicalVaultMigration(snapshot);
  if (plan.action !== 'record-intent' || plan.state !== 'eligible') {
    throw new Error('Wallet storage optimization is not currently eligible.');
  }
  return snapshot;
}
