import { writeCanonicalVaultMigrationJournalVerified } from './canonical-vault-migration-journal-store';
import { executeAuthorizedCanonicalVaultMigrationIntent } from './canonical-vault-authorized-intent-executor-core';
import { readStoredCanonicalVaultMigrationSnapshot } from './canonical-vault-migration-snapshot';
import type { CanonicalVaultMigrationStartAuthorization } from './canonical-vault-migration-start-authorization';

export async function recordAuthorizedStoredCanonicalVaultMigrationIntent(
  authorization: CanonicalVaultMigrationStartAuthorization,
  createdAt: string,
  now = Date.now(),
) {
  return executeAuthorizedCanonicalVaultMigrationIntent(authorization, createdAt, now, {
    readSnapshot: readStoredCanonicalVaultMigrationSnapshot,
    writeJournalVerified: writeCanonicalVaultMigrationJournalVerified,
  });
}

