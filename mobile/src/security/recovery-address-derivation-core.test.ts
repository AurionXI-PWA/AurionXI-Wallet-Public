import { describe, expect, it, vi } from 'vitest';

import { deriveActiveRecoveryAddress } from './recovery-address-derivation-core';

const TEST_ADDRESS = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';

describe('managed recovery public-address derivation boundary', () => {
  it('does not access the phrase while wallet-secret handling is disabled', () => {
    const withPhrase = vi.fn();
    expect(() => deriveActiveRecoveryAddress({
      deriveAddress: vi.fn(),
      walletSecretFeatureEnabled: false,
      withPhrase,
    })).toThrow('disabled');
    expect(withPhrase).not.toHaveBeenCalled();
  });

  it('returns only the validated public EVM address', () => {
    const deriveAddress = vi.fn().mockReturnValue(TEST_ADDRESS);
    expect(deriveActiveRecoveryAddress({
      deriveAddress,
      walletSecretFeatureEnabled: true,
      withPhrase: (consumer) => consumer('public test mnemonic'),
    })).toBe(TEST_ADDRESS);
    expect(deriveAddress).toHaveBeenCalledWith('public test mnemonic');
  });

  it('rejects malformed derivation output', () => {
    expect(() => deriveActiveRecoveryAddress({
      deriveAddress: () => 'not-an-address',
      walletSecretFeatureEnabled: true,
      withPhrase: (consumer) => consumer('public test mnemonic'),
    })).toThrow('failed closed');
  });
});
