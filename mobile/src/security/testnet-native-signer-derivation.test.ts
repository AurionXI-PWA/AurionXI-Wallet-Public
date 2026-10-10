import { describe, expect, it } from 'vitest';
import { parseTransaction } from 'viem';

import { deriveNativeTestnetSignerFromEntropy } from './testnet-native-signer-derivation';

describe('native Testnet signer derivation', () => {
  it('derives the canonical local address and signs a BSC Testnet envelope only in memory', async () => {
    const entropy = Uint8Array.from({ length: 32 }, (_, index) => index + 1);
    const signer = deriveNativeTestnetSignerFromEntropy(entropy);
    const serialized = await signer.signTransaction({
      chainId: 97,
      nonce: 0,
      gas: 21_000n,
      gasPrice: 1_000_000_000n,
      to: '0x1111111111111111111111111111111111111111',
      data: '0x',
      value: 1n,
    });
    const parsed = parseTransaction(serialized);

    expect(signer.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(parsed.chainId).toBe(97);
    expect(parsed.to).toBe('0x1111111111111111111111111111111111111111');
  });
});
