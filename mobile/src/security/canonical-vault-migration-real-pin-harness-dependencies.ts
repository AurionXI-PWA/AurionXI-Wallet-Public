import { authenticateCanonicalVaultMigrationPin } from './canonical-vault-migration-pin-verifier';
import { loadStoredEligibleCanonicalVaultMigrationSnapshot } from './canonical-vault-migration-eligible-snapshot-loader';

export type CanonicalVaultMigrationRealPinHarnessDependencies = {
  authenticatePin: typeof authenticateCanonicalVaultMigrationPin;
  loadEligibleSnapshot: typeof loadStoredEligibleCanonicalVaultMigrationSnapshot;
};

export function getCanonicalVaultMigrationRealPinHarnessDependencies(): CanonicalVaultMigrationRealPinHarnessDependencies {
  return {
    authenticatePin: authenticateCanonicalVaultMigrationPin,
    loadEligibleSnapshot: loadStoredEligibleCanonicalVaultMigrationSnapshot,
  };
}
