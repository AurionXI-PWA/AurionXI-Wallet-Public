import { executeVerifiedCanonicalVaultCandidateRemoval } from './canonical-vault-candidate-removal-executor-core';
import { readStoredCanonicalVaultMigrationSnapshot } from './canonical-vault-migration-snapshot';
import { deleteVaultV3Candidate } from './vault-store';

export async function removeStoredVerifiedCanonicalVaultCandidate() {
  return executeVerifiedCanonicalVaultCandidateRemoval({
    deleteCandidate: deleteVaultV3Candidate,
    readSnapshot: readStoredCanonicalVaultMigrationSnapshot,
  });
}

