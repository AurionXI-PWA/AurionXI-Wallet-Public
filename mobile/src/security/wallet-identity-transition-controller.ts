import { authenticateEncryptedVaultWithRetry } from './vault-workflow';
import { WalletIdentityTransitionController } from './wallet-identity-transition-controller-core';

export function createWalletIdentityTransitionController(): WalletIdentityTransitionController {
  return new WalletIdentityTransitionController({
    authenticatePin: authenticateEncryptedVaultWithRetry,
  });
}
