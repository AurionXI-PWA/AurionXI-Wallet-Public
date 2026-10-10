import { executeCanonicalVaultPrimaryCopy } from './canonical-vault-primary-copy-executor-core';
import { readStoredCanonicalVaultMigrationSnapshot } from './canonical-vault-migration-snapshot';
import { writeVaultV3 } from './vault-store';

export async function writeStoredCanonicalVaultPrimaryCopy() {
  return executeCanonicalVaultPrimaryCopy({
    readSnapshot: readStoredCanonicalVaultMigrationSnapshot,
    writePrimary: writeVaultV3,
  });
}

