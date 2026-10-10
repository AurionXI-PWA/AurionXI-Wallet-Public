import { mnemonicToAccount } from 'viem/accounts';
import { afterEach, describe, expect, it } from 'vitest';

import { deriveActiveRecoveryAddress } from './recovery-address-derivation-core';
import {
  beginRecoverySecretSession,
  destroyActiveRecoverySecretSession,
  withActiveRecoveryPhrase,
} from './recovery-secret-session-manager';
import { WALLET_KEY_POLICY } from './wallet-key-policy';

afterEach(() => destroyActiveRecoverySecretSession());

describe('managed recovery address integration vector', () => {
  it('derives the known public address without returning an account object', () => {
    beginRecoverySecretSession(new Uint8Array(16));
    expect(deriveActiveRecoveryAddress({
      deriveAddress: (phrase) => mnemonicToAccount(phrase, {
        path: WALLET_KEY_POLICY.derivationPath,
      }).address,
      walletSecretFeatureEnabled: true,
      withPhrase: withActiveRecoveryPhrase,
    })).toBe('0x9858EfFD232B4033E47d90003D41EC34EcaEda94');
  });
});
