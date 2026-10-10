import type { CanonicalVaultMigrationJournal } from './canonical-vault-migration-journal-core';
import {
  executeCanonicalVaultMigrationIntent,
  type CanonicalVaultMigrationIntentExecutorDependencies,
} from './canonical-vault-migration-intent-executor-core';
import type { CanonicalVaultMigrationSnapshot } from './canonical-vault-migration-policy';
import {
  canStartCanonicalVaultMigration,
  type CanonicalVaultMigrationStartAuthorization,
} from './canonical-vault-migration-start-authorization';

export type CanonicalVaultAuthorizedIntentExecutorDependencies = {
  readSnapshot: () => Promise<CanonicalVaultMigrationSnapshot>;
  writeJournalVerified: (
    journal: CanonicalVaultMigrationJournal,
  ) => Promise<CanonicalVaultMigrationJournal>;
};

export async function executeAuthorizedCanonicalVaultMigrationIntent(
  authorization: CanonicalVaultMigrationStartAuthorization,
  createdAt: string,
  now: number,
  dependencies: CanonicalVaultAuthorizedIntentExecutorDependencies,
): Promise<{ action: 'intent-recorded' }> {
  const authorizationSnapshot = await dependencies.readSnapshot();
  if (!canStartCanonicalVaultMigration(authorization, authorizationSnapshot, now)) {
    throw new Error('Canonical migration start authorization is invalid, expired, or stale.');
  }
  const intentDependencies: CanonicalVaultMigrationIntentExecutorDependencies = {
    readSnapshot: dependencies.readSnapshot,
    writeJournalVerified: dependencies.writeJournalVerified,
  };
  return executeCanonicalVaultMigrationIntent(createdAt, intentDependencies);
}

