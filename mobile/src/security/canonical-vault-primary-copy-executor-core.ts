import {
  planCanonicalVaultMigration,
  type CanonicalVaultMigrationSnapshot,
} from './canonical-vault-migration-policy';
import type { VaultV3Envelope } from './vault-envelope-v3';

export type CanonicalVaultPrimaryCopyExecutorDependencies = {
  readSnapshot: () => Promise<CanonicalVaultMigrationSnapshot>;
  writePrimary: (vault: VaultV3Envelope) => Promise<void>;
};

export async function executeCanonicalVaultPrimaryCopy(
  dependencies: CanonicalVaultPrimaryCopyExecutorDependencies,
): Promise<{ action: 'primary-copy-written' }> {
  const snapshot = await dependencies.readSnapshot();
  const plan = planCanonicalVaultMigration(snapshot);
  if (
    plan.action !== 'write-primary-copy' ||
    plan.state !== 'intent-recorded' ||
    !snapshot.candidate
  ) {
    throw new Error('Canonical primary copy is not eligible.');
  }

  await dependencies.writePrimary(snapshot.candidate);

  const verifiedSnapshot = await dependencies.readSnapshot();
  const verifiedPlan = planCanonicalVaultMigration(verifiedSnapshot);
  if (
    verifiedPlan.action !== 'mark-primary-written' ||
    verifiedPlan.state !== 'primary-copy-present'
  ) {
    throw new Error('Canonical primary copy failed exact fresh snapshot verification.');
  }
  return { action: 'primary-copy-written' };
}

