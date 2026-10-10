import type { VaultActiveSlotRecord } from './vault-active-slot-core';
import {
  planCanonicalVaultMigration,
  type CanonicalVaultMigrationSnapshot,
} from './canonical-vault-migration-policy';

const PRIMARY_SLOT: VaultActiveSlotRecord = {
  activeSlot: 'primary',
  format: 'aurionxi-vault-active-slot-v1',
};

export type CanonicalVaultPrimaryPointerExecutorDependencies = {
  readSnapshot: () => Promise<CanonicalVaultMigrationSnapshot>;
  writeActiveSlot: (record: VaultActiveSlotRecord) => Promise<void>;
};

export async function executeCanonicalVaultPrimaryPointerActivation(
  dependencies: CanonicalVaultPrimaryPointerExecutorDependencies,
): Promise<{ action: 'primary-pointer-activated' }> {
  const snapshot = await dependencies.readSnapshot();
  const plan = planCanonicalVaultMigration(snapshot);
  if (plan.action !== 'activate-primary-pointer' || plan.state !== 'primary-written') {
    throw new Error('Canonical primary pointer activation is not eligible.');
  }

  await dependencies.writeActiveSlot(PRIMARY_SLOT);

  const verifiedSnapshot = await dependencies.readSnapshot();
  const verifiedPlan = planCanonicalVaultMigration(verifiedSnapshot);
  if (
    verifiedPlan.action !== 'mark-primary-authoritative' ||
    verifiedPlan.state !== 'primary-pointer-active' ||
    verifiedSnapshot.activeSlot?.activeSlot !== 'primary' ||
    verifiedSnapshot.activeSlot.transactionId !== undefined
  ) {
    throw new Error('Canonical primary pointer activation failed fresh snapshot verification.');
  }
  return { action: 'primary-pointer-activated' };
}

