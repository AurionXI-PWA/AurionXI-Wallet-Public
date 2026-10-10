import { mnemonicToAccount } from 'viem/accounts';

import { WALLET_SECRET_FEATURE } from '@/config/network';

import { deriveActiveRecoveryAddress } from './recovery-address-derivation-core';
import { withActiveRecoveryPhrase } from './recovery-secret-session-manager';
import { WALLET_KEY_POLICY } from './wallet-key-policy';

export function deriveActiveTestnetRecoveryAddress(): `0x${string}` {
  return deriveActiveRecoveryAddress({
    deriveAddress: (phrase) => mnemonicToAccount(phrase, {
      path: WALLET_KEY_POLICY.derivationPath,
    }).address,
    walletSecretFeatureEnabled: WALLET_SECRET_FEATURE.enabled,
    withPhrase: withActiveRecoveryPhrase,
  });
}

export function deriveTestnetRecoveryAddressFromPhrase(phrase: string): `0x${string}` {
  if (!WALLET_SECRET_FEATURE.enabled) {
    throw new Error('Wallet-secret handling is disabled for this build.');
  }
  return mnemonicToAccount(phrase, {
    path: WALLET_KEY_POLICY.derivationPath,
  }).address;
}
