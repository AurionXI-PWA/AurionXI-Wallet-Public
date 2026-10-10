import { describe, expect, it, vi } from 'vitest';

import { getMainnetBoundReviewFingerprint } from './mainnet-review-envelope';
import { prepareUnsignedMainnetTransaction } from './mainnet-local-signing-adapter';
import { signConfirmedMainnetEnvelope } from './mainnet-signing-executor-core';
import type { MainnetReviewEnvelope } from './mainnet-review-envelope';

const review: MainnetReviewEnvelope = { chainId: 56, senderAddress: '0x1111111111111111111111111111111111111111', assetId: 'native-bnb', assetContract: null, recipient: '0xEf7c8E41ba2707c2E92b8837Ff4B5EB55cec27e6', amount: 1n, nonce: 2, gas: 21_000n, gasPrice: 1n, observedAt: 1 };

describe('Mainnet production signing foundation', () => {
  it('hard-blocks a direct signing call before it can reach a scoped signer in the preview release', async () => {
    const prepared = prepareUnsignedMainnetTransaction(review);
    if (!prepared.ok) throw new Error('fixture failure');
    const signer = vi.fn(async () => '0x0102' as const);
    await expect(signConfirmedMainnetEnvelope({ session: { chainId: 56, reviewFingerprint: getMainnetBoundReviewFingerprint(review), expiresAt: 100 }, now: 10, activeWalletAddress: review.senderAddress, review, envelope: prepared.transaction, withScopedSigner: async (consume) => consume({ address: review.senderAddress, signTransaction: signer }) })).rejects.toThrow('Mainnet signing is not released.');
    expect(signer).not.toHaveBeenCalled();
  });

  it('blocks an expired confirmation session before any signer can be used', async () => {
    const prepared = prepareUnsignedMainnetTransaction(review);
    if (!prepared.ok) throw new Error('fixture failure');
    await expect(signConfirmedMainnetEnvelope({ session: { chainId: 56, reviewFingerprint: 'x', expiresAt: 10 }, now: 10, activeWalletAddress: review.senderAddress, review, envelope: prepared.transaction, withScopedSigner: async (consume) => consume({ address: review.senderAddress, signTransaction: async () => '0x0102' }) })).rejects.toThrow('Mainnet signing is not released.');
  });

  it('blocks a mutated transaction before any signer can be used', async () => {
    const prepared = prepareUnsignedMainnetTransaction(review);
    if (!prepared.ok) throw new Error('fixture failure');
    await expect(signConfirmedMainnetEnvelope({
      session: { chainId: 56, reviewFingerprint: getMainnetBoundReviewFingerprint(review), expiresAt: 100 },
      now: 10,
      activeWalletAddress: review.senderAddress,
      review,
      envelope: { ...prepared.transaction, nonce: prepared.transaction.nonce + 1 },
      withScopedSigner: async (consume) => consume({ address: review.senderAddress, signTransaction: async () => '0x0102' }),
    })).rejects.toThrow('Mainnet signing is not released.');
  });
});
