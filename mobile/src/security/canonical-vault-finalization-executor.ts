import { writeCanonicalVaultMigrationJournalVerified } from './canonical-vault-migration-journal-store';
import { executeCanonicalVaultMigrationFinalization } from './canonical-vault-finalization-executor-core';
import { readStoredCanonicalVaultMigrationSnapshot } from './canonical-vault-migration-snapshot';

export async function finalizeStoredCanonicalVaultMigration() {
  return executeCanonicalVaultMigrationFinalization({
    readSnapshot: readStoredCanonicalVaultMigrationSnapshot,
    writeJournalVerified: writeCanonicalVaultMigrationJournalVerified,
  });
}

