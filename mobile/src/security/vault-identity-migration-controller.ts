import { VaultIdentityMigrationController } from './vault-identity-migration-controller-core';
import { authenticateEncryptedVaultWithRetry } from './vault-workflow';

export function createVaultIdentityMigrationController(): VaultIdentityMigrationController {
  return new VaultIdentityMigrationController({
    authenticatePin: authenticateEncryptedVaultWithRetry,
  });
}
