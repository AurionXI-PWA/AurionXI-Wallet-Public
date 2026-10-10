import { authenticateEncryptedVaultWithRetry } from './vault-workflow';
import { authenticateStoredRecoveryOwnership } from './recovery-ownership-authenticator';
import {
  VaultReplacementResumeController,
  type VaultReplacementResumeScope,
} from './vault-replacement-resume-controller-core';

export type RecoveryOwnershipAuthenticator = (recoveryPhrase: string, scope: VaultReplacementResumeScope) => Promise<void>;

export function createVaultReplacementResumeController(
  authenticateRecoveryOwnership: RecoveryOwnershipAuthenticator = authenticateStoredRecoveryOwnership,
): VaultReplacementResumeController {
  return new VaultReplacementResumeController({
    authenticatePin: authenticateEncryptedVaultWithRetry,
    authenticateRecoveryOwnership,
  });
}
