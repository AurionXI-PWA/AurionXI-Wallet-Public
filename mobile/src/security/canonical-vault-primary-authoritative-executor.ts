import { writeCanonicalVaultMigrationJournalVerified } from './canonical-vault-migration-journal-store';
import { executeCanonicalVaultPrimaryAuthoritativeAdvance } from './canonical-vault-primary-authoritative-executor-core';
import { readStoredCanonicalVaultMigrationSnapshot } from './canonical-vault-migration-snapshot';

export async function recordStoredCanonicalVaultPrimaryAuthoritative() {
  return executeCanonicalVaultPrimaryAuthoritativeAdvance({
    readSnapshot: readStoredCanonicalVaultMigrationSnapshot,
    writeJournalVerified: writeCanonicalVaultMigrationJournalVerified,
  });
}

