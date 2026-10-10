import { describe, expect, it } from 'vitest';

import { getMainnetBoundReviewFingerprint, type MainnetReviewEnvelope } from './mainnet-review-envelope';

const review: MainnetReviewEnvelope = { chainId: 56, senderAddress: '0x1111111111111111111111111111111111111111', assetId: 'arxi', assetContract: '0x6fFEC4860325f8bfB3F000354708A7d0caE4b250', recipient: '0xEf7c8E41ba2707c2E92b8837Ff4B5EB55cec27e6', amount: 1n, nonce: 2, gas: 160_000n, gasPrice: 1n, observedAt: 1 };

describe('Mainnet review digest', () => {
  it('is a canonical cryptographic digest stable across address casing', () => {
    expect(getMainnetBoundReviewFingerprint(review)).toMatch(/^0x[0-9a-f]{64}$/);
    expect(getMainnetBoundReviewFingerprint({ ...review, senderAddress: review.senderAddress.toUpperCase() as `0x${string}` })).toBe(getMainnetBoundReviewFingerprint(review));
  });
  it('changes when one reviewed semantic field changes', () => {
    expect(getMainnetBoundReviewFingerprint({ ...review, recipient: '0x2222222222222222222222222222222222222222' })).not.toBe(getMainnetBoundReviewFingerprint(review));
  });
});
