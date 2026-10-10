import { RetiredPrimaryCleanupController } from './retired-primary-cleanup-controller-core';
import { authenticateEncryptedVaultWithRetry } from './vault-workflow';

export function createRetiredPrimaryCleanupController(): RetiredPrimaryCleanupController {
  return new RetiredPrimaryCleanupController({
    authenticatePin: authenticateEncryptedVaultWithRetry,
  });
}
