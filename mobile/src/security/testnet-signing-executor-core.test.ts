import { describe, expect, it, vi } from 'vitest';

import { signPinConfirmedTestnetEnvelope, TestnetSigningExecutorError } from './testnet-signing-executor-core';

const address = '0x1111111111111111111111111111111111111111' as const;
const session = { chainId: 97 as const, assetId: 'arxi' as const, recipient: address, amount: 1n, expiresAt: 100 };
const envelope = { chainId: 97 as const, nonce: 0, gas: 65_000n, gasPrice: 1_000_000_000n, to: address, data: '0x' as const, value: 0n };

describe('Testnet signing executor', () => {
  it('signs only through a live scoped Testnet signer callback', async () => {
    const signTransaction = vi.fn().mockResolvedValue('0xabc' as const);
    const withScopedSigner = async <T>(consumer: (signer: { address: typeof address; signTransaction: typeof signTransaction }) => Promise<T>) => consumer({ address, signTransaction });
    await expect(signPinConfirmedTestnetEnvelope({ session, now: 99, expectedAddress: address, envelope, withScopedSigner })).resolves.toBe('0xabc');
    expect(signTransaction).toHaveBeenCalledWith(envelope);
  });

  it('fails closed for expiry, wrong identity, or an invalid envelope', async () => {
    const withSigner = async <T>(consumer: (signer: { address: typeof address; signTransaction: () => Promise<`0x${string}`> }) => Promise<T>) => consumer({ address, signTransaction: async () => '0xabc' });
    await expect(signPinConfirmedTestnetEnvelope({ session, now: 100, expectedAddress: address, envelope, withScopedSigner: withSigner })).rejects.toBeInstanceOf(TestnetSigningExecutorError);
    await expect(signPinConfirmedTestnetEnvelope({ session, now: 99, expectedAddress: '0x2222222222222222222222222222222222222222', envelope, withScopedSigner: withSigner })).rejects.toBeInstanceOf(TestnetSigningExecutorError);
    await expect(signPinConfirmedTestnetEnvelope({ session, now: 99, expectedAddress: address, envelope: { ...envelope, gas: 0n }, withScopedSigner: withSigner })).rejects.toBeInstanceOf(TestnetSigningExecutorError);
  });
});
