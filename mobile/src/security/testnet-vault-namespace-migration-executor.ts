import { authenticateEncryptedVaultWithRetry } from './vault-workflow';
import {
  readLegacyVaultV3,
  readTestnetVaultV3,
  writeTestnetVaultV3,
} from './vault-store';
import {
  readLegacyWalletIdentityRecord,
  readTestnetWalletIdentityRecord,
  writeTestnetWalletIdentityRecord,
} from './wallet-identity-record-store';
import { migrateLegacyTestnetNamespace } from './testnet-vault-namespace-migration-core';
import { enableStoredVaultBiometrics } from './vault-biometric-workflow';

let migrationActive = false;

/**
 * Moves the current legacy Testnet vault into its own storage namespace.
 * The legacy records are deliberately retained. The copied envelope starts
 * with no biometric slot so a new device-bound key is created only after the
 * PIN has been verified and the user approves the system prompt.
 */
export async function executeTestnetNamespaceMigrationWithBiometricReenrollment(pin: string) {
  if (migrationActive) throw new Error('Testnet namespace migration is already active.');
  migrationActive = true;
  try {
    await authenticateEncryptedVaultWithRetry(pin);
    const result = await migrateLegacyTestnetNamespace({
      readLegacyVault: async () => {
        const legacy = await readLegacyVaultV3();
        return legacy ? { ...legacy, biometric: undefined } : null;
      },
      readLegacyIdentity: readLegacyWalletIdentityRecord,
      writeTestnetVault: writeTestnetVaultV3,
      writeTestnetIdentity: writeTestnetWalletIdentityRecord,
      readTestnetVault: readTestnetVaultV3,
      readTestnetIdentity: readTestnetWalletIdentityRecord,
    }, (left, right) => JSON.stringify(left) === JSON.stringify(right));
    await enableStoredVaultBiometrics(pin);
    return result;
  } finally {
    migrationActive = false;
  }
}
