import { describe, expect, it } from 'vitest';

import { revalidateMainnetReviewImmediatelyBeforeSigning } from './mainnet-pre-sign-revalidation';
import type { MainnetReviewEnvelope } from './mainnet-review-envelope';

const review: MainnetReviewEnvelope = { chainId: 56, senderAddress: '0x1111111111111111111111111111111111111111', assetId: 'native-bnb', assetContract: null, recipient: '0x2222222222222222222222222222222222222222', amount: 1n, nonce: 5, gas: 21_000n, gasPrice: 2n, observedAt: 1 };
const live = { chainId: 56, senderAddress: review.senderAddress, pendingNonce: 5, gasLimit: 21_000n, gasPrice: 2n } as const;

describe('Mainnet pre-sign revalidation', () => {
  it('accepts only the exact reviewed live values', () => expect(revalidateMainnetReviewImmediatelyBeforeSigning(review, live)).toEqual({ ok: true }));
  it.each([
    [{ ...live, chainId: 97 }, 'chain-changed'],
    [{ ...live, senderAddress: '0x3333333333333333333333333333333333333333' as const }, 'sender-changed'],
    [{ ...live, pendingNonce: 6 }, 'nonce-changed'],
    [{ ...live, gasLimit: 21_001n }, 'gas-changed'],
    [{ ...live, gasPrice: 3n }, 'fee-changed'],
  ] as const)('forces a new review when %s changes', (changed, reason) => {
    expect(revalidateMainnetReviewImmediatelyBeforeSigning(review, changed)).toEqual({ ok: false, reason });
  });
});
