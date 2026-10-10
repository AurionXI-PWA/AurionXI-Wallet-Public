import { describe, expect, it, vi } from 'vitest';

import { generateRecoveryPhraseWithDependencies } from './recovery-phrase-generation-core';

const ZERO_ENTROPY_256_VECTOR = `${'abandon '.repeat(23)}art`;

describe('secure recovery phrase generation foundation', () => {
  it('does not request entropy while the wallet-secret gate is disabled', async () => {
    const randomBytes = vi.fn();
    await expect(generateRecoveryPhraseWithDependencies({
      randomBytes,
      walletSecretFeatureEnabled: false,
    })).rejects.toThrow('disabled');
    expect(randomBytes).not.toHaveBeenCalled();
  });

  it('matches the official 256-bit zero-entropy English vector', async () => {
    const entropy = new Uint8Array(32);
    await expect(generateRecoveryPhraseWithDependencies({
      randomBytes: vi.fn().mockResolvedValue(entropy),
      walletSecretFeatureEnabled: true,
    })).resolves.toBe(ZERO_ENTROPY_256_VECTOR);
  });

  it('requests exactly 256 bits from the injected secure random source', async () => {
    const randomBytes = vi.fn().mockResolvedValue(new Uint8Array(32));
    await generateRecoveryPhraseWithDependencies({
      randomBytes,
      walletSecretFeatureEnabled: true,
    });
    expect(randomBytes).toHaveBeenCalledWith(32);
  });

  it('overwrites the mutable entropy buffer after phrase conversion', async () => {
    const entropy = Uint8Array.from({ length: 32 }, (_, index) => index);
    await generateRecoveryPhraseWithDependencies({
      randomBytes: vi.fn().mockResolvedValue(entropy),
      walletSecretFeatureEnabled: true,
    });
    expect([...entropy]).toEqual(new Array(32).fill(0));
  });

  it('fails closed and overwrites an invalid-length entropy buffer', async () => {
    const entropy = new Uint8Array([1, 2, 3]);
    await expect(generateRecoveryPhraseWithDependencies({
      randomBytes: vi.fn().mockResolvedValue(entropy),
      walletSecretFeatureEnabled: true,
    })).rejects.toThrow('invalid entropy length');
    expect([...entropy]).toEqual([0, 0, 0]);
  });
});
