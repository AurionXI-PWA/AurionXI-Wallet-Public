import { writeCanonicalVaultMigrationJournalVerified } from './canonical-vault-migration-journal-store';
import { executeCanonicalVaultMigrationIntent } from './canonical-vault-migration-intent-executor-core';
import { readStoredCanonicalVaultMigrationSnapshot } from './canonical-vault-migration-snapshot';

export async function recordStoredCanonicalVaultMigrationIntent(createdAt: string) {
  return executeCanonicalVaultMigrationIntent(createdAt, {
    readSnapshot: readStoredCanonicalVaultMigrationSnapshot,
    writeJournalVerified: writeCanonicalVaultMigrationJournalVerified,
  });
}

