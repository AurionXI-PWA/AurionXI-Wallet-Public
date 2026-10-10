import { writeVaultActiveSlot } from './vault-active-slot-store';
import { executeCanonicalVaultPrimaryPointerActivation } from './canonical-vault-primary-pointer-executor-core';
import { readStoredCanonicalVaultMigrationSnapshot } from './canonical-vault-migration-snapshot';

export async function activateStoredCanonicalVaultPrimaryPointer() {
  return executeCanonicalVaultPrimaryPointerActivation({
    readSnapshot: readStoredCanonicalVaultMigrationSnapshot,
    writeActiveSlot: writeVaultActiveSlot,
  });
}

