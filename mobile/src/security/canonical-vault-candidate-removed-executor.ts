import { writeCanonicalVaultMigrationJournalVerified } from './canonical-vault-migration-journal-store';
import { executeCanonicalVaultCandidateRemovedAdvance } from './canonical-vault-candidate-removed-executor-core';
import { readStoredCanonicalVaultMigrationSnapshot } from './canonical-vault-migration-snapshot';

export async function recordStoredCanonicalVaultCandidateRemoved() {
  return executeCanonicalVaultCandidateRemovedAdvance({
    readSnapshot: readStoredCanonicalVaultMigrationSnapshot,
    writeJournalVerified: writeCanonicalVaultMigrationJournalVerified,
  });
}

