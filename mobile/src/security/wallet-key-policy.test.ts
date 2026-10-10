import { describe, expect, it } from 'vitest';

import { isSupportedBip39ImportWordCount, WALLET_KEY_POLICY } from './wallet-key-policy';

describe('wallet key standards policy', () => {
  it('fixes the first EVM account to the reviewed BIP-44 path', () => {
    expect(WALLET_KEY_POLICY).toMatchObject({
      accountIndex: 0,
      addressIndex: 0,
      changeIndex: 0,
      coinType: 60,
      derivationPath: "m/44'/60'/0'/0/0",
      purpose: 44,
    });
  });

  it('generates English 24-word mnemonics from 256-bit entropy', () => {
    expect(WALLET_KEY_POLICY.bip39EntropyBits).toBe(256);
    expect(WALLET_KEY_POLICY.bip39GeneratedWordCount).toBe(24);
    expect(WALLET_KEY_POLICY.generatedWordlist).toBe('english');
  });

  it('accepts only standard BIP-39 import lengths', () => {
    expect([12, 15, 18, 21, 24].every(isSupportedBip39ImportWordCount)).toBe(true);
    expect([0, 11, 13, 23, 25].some(isSupportedBip39ImportWordCount)).toBe(false);
  });

  it('does not offer BIP-39 passphrases in Beta', () => {
    expect(WALLET_KEY_POLICY.passphraseSupportedInBeta).toBe(false);
  });
});
