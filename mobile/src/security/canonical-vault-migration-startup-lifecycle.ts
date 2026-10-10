import { auditStoredCanonicalVaultMigration } from './canonical-vault-migration-audit';
import { recordStoredCanonicalVaultCandidateRemoved } from './canonical-vault-candidate-removed-executor';
import { finalizeStoredCanonicalVaultMigration } from './canonical-vault-finalization-executor';
import { recordStoredCanonicalVaultPrimaryAuthoritative } from './canonical-vault-primary-authoritative-executor';
import { writeStoredCanonicalVaultPrimaryCopy } from './canonical-vault-primary-copy-executor';
import { activateStoredCanonicalVaultPrimaryPointer } from './canonical-vault-primary-pointer-executor';
import { recordStoredCanonicalVaultPrimaryWritten } from './canonical-vault-primary-written-executor';
import { runCanonicalVaultMigrationStartupLifecycle } from './canonical-vault-migration-startup-lifecycle-core';

export async function runStoredCanonicalVaultMigrationStartupLifecycle() {
  return runCanonicalVaultMigrationStartupLifecycle({
    readPlan: auditStoredCanonicalVaultMigration,
    recoverOneSafeStep: async (action) => {
      switch (action) {
        case 'write-primary-copy': await writeStoredCanonicalVaultPrimaryCopy(); return;
        case 'mark-primary-written': await recordStoredCanonicalVaultPrimaryWritten(); return;
        case 'activate-primary-pointer': await activateStoredCanonicalVaultPrimaryPointer(); return;
        case 'mark-primary-authoritative': await recordStoredCanonicalVaultPrimaryAuthoritative(); return;
        case 'mark-candidate-removed': await recordStoredCanonicalVaultCandidateRemoved(); return;
        case 'mark-finalized': await finalizeStoredCanonicalVaultMigration(); return;
      }
    },
  });
}

