import { getRandomBytesAsync } from 'expo-crypto';
import { mnemonicToAccount } from 'viem/accounts';

import { MAINNET_DEVICE_LOCAL_VAULT_CAPABILITY } from './mainnet-vault-capability';

import { deriveActiveRecoveryAddress } from './recovery-address-derivation-core';
import { beginImportedRecoverySession } from './recovery-import-core';
import { RecoverySessionStartGate } from './recovery-session-start-core';
import { WALLET_KEY_POLICY } from './wallet-key-policy';
import {
  beginMainnetRecoverySecretSession,
  withActiveMainnetRecoveryPhrase,
} from './mainnet-recovery-secret-session-manager';

const startGate = new RecoverySessionStartGate();

export function beginNewMainnetRecoverySession(): Promise<void> {
  return startGate.run({ beginSession: beginMainnetRecoverySecretSession, randomBytes: getRandomBytesAsync, walletSecretFeatureEnabled: MAINNET_DEVICE_LOCAL_VAULT_CAPABILITY.enabled });
}

export function beginImportedMainnetRecoverySession(phrase: string): void {
  beginImportedRecoverySession(phrase, { beginSession: beginMainnetRecoverySecretSession, walletSecretFeatureEnabled: MAINNET_DEVICE_LOCAL_VAULT_CAPABILITY.enabled });
}

export function deriveActiveMainnetRecoveryAddress(): `0x${string}` {
  return deriveActiveRecoveryAddress({
    deriveAddress: (phrase) => mnemonicToAccount(phrase, { path: WALLET_KEY_POLICY.derivationPath }).address,
    walletSecretFeatureEnabled: MAINNET_DEVICE_LOCAL_VAULT_CAPABILITY.enabled,
    withPhrase: withActiveMainnetRecoveryPhrase,
  });
}
