import { writeCanonicalVaultMigrationJournalVerified } from './canonical-vault-migration-journal-store';
import { executeCanonicalVaultPrimaryWrittenAdvance } from './canonical-vault-primary-written-executor-core';
import { readStoredCanonicalVaultMigrationSnapshot } from './canonical-vault-migration-snapshot';

export async function recordStoredCanonicalVaultPrimaryWritten() {
  return executeCanonicalVaultPrimaryWrittenAdvance({
    readSnapshot: readStoredCanonicalVaultMigrationSnapshot,
    writeJournalVerified: writeCanonicalVaultMigrationJournalVerified,
  });
}

