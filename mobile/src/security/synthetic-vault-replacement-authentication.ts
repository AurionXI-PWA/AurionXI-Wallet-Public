import { unlockEncryptedVaultWithRetry } from './vault-workflow';
import { authenticateSyntheticVaultReplacement } from './synthetic-vault-replacement-authentication-core';

export function authenticateStoredSyntheticVaultReplacement(pin: string) {
  return authenticateSyntheticVaultReplacement(pin, {
    unlockWithPin: unlockEncryptedVaultWithRetry,
  });
}
