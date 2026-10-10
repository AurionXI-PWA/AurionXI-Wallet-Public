import { describe, expect, it, vi } from 'vitest';

import { signTestnetEnvelopeWithFreshPinCore } from './testnet-native-signing-operation-core';

const address = '0x1111111111111111111111111111111111111111' as const;
const session = { chainId: 97 as const, assetId: 'arxi' as const, recipient: address, amount: 1n, expiresAt: 100 };
const envelope = { chainId: 97 as const, nonce: 0, gas: 65_000n, gasPrice: 1_000_000_000n, to: address, data: '0x' as const, value: 0n };

describe('native Testnet signing operation', () => {
  it('uses only a caller-scoped signer and returns a local payload', async () => {
    const signTransaction = vi.fn().mockResolvedValue('0xabc' as const);
    const withScopedSigner = async <T>(consume: (signer: { address: typeof address; signTransaction: typeof signTransaction }) => Promise<T>) => consume({ address, signTransaction });

    await expect(signTestnetEnvelopeWithFreshPinCore({
      envelope,
      expectedAddress: address,
      now: 99,
      session,
      withScopedSigner,
    })).resolves.toBe('0xabc');
    expect(signTransaction).toHaveBeenCalledWith(envelope);
  });
});
