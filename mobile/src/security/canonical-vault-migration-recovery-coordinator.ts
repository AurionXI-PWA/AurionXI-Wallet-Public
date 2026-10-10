import { auditStoredCanonicalVaultMigration } from './canonical-vault-migration-audit';
import { recordStoredCanonicalVaultCandidateRemoved } from './canonical-vault-candidate-removed-executor';
import { removeStoredVerifiedCanonicalVaultCandidate } from './canonical-vault-candidate-removal-executor';
import { finalizeStoredCanonicalVaultMigration } from './canonical-vault-finalization-executor';
import { recordStoredCanonicalVaultMigrationIntent } from './canonical-vault-migration-intent-executor';
import { recoverOneCanonicalVaultMigrationStep } from './canonical-vault-migration-recovery-coordinator-core';
import { recordStoredCanonicalVaultPrimaryAuthoritative } from './canonical-vault-primary-authoritative-executor';
import { writeStoredCanonicalVaultPrimaryCopy } from './canonical-vault-primary-copy-executor';
import { activateStoredCanonicalVaultPrimaryPointer } from './canonical-vault-primary-pointer-executor';
import { recordStoredCanonicalVaultPrimaryWritten } from './canonical-vault-primary-written-executor';

export async function recoverOneStoredCanonicalVaultMigrationStep(createdAt: string) {
  return recoverOneCanonicalVaultMigrationStep({
    activatePrimaryPointer: async () => { await activateStoredCanonicalVaultPrimaryPointer(); },
    markCandidateRemoved: async () => { await recordStoredCanonicalVaultCandidateRemoved(); },
    markFinalized: async () => { await finalizeStoredCanonicalVaultMigration(); },
    markPrimaryAuthoritative: async () => { await recordStoredCanonicalVaultPrimaryAuthoritative(); },
    markPrimaryWritten: async () => { await recordStoredCanonicalVaultPrimaryWritten(); },
    readPlan: auditStoredCanonicalVaultMigration,
    recordIntent: async () => { await recordStoredCanonicalVaultMigrationIntent(createdAt); },
    removeCandidate: async () => { await removeStoredVerifiedCanonicalVaultCandidate(); },
    writePrimaryCopy: async () => { await writeStoredCanonicalVaultPrimaryCopy(); },
  });
}

