import { describe, expect, it } from 'vitest';

import { hasValidMainnetSenderBinding } from './mainnet-sender-binding';
import type { MainnetReviewEnvelope } from './mainnet-review-envelope';

const sender = '0x1111111111111111111111111111111111111111' as const;
const review: MainnetReviewEnvelope = { chainId: 56, senderAddress: sender, assetId: 'native-bnb', assetContract: null, recipient: '0x2222222222222222222222222222222222222222', amount: 1n, nonce: 1, gas: 21_000n, gasPrice: 1n, observedAt: 1 };

describe('Mainnet sender binding', () => {
  it('accepts only matching review sender, active identity and scoped signer', () => {
    expect(hasValidMainnetSenderBinding({ review, activeWalletAddress: sender, signerAddress: sender })).toBe(true);
  });

  it.each([
    ['active wallet', { activeWalletAddress: '0x3333333333333333333333333333333333333333' as const, signerAddress: sender }],
    ['scoped signer', { activeWalletAddress: sender, signerAddress: '0x3333333333333333333333333333333333333333' as const }],
  ])('rejects a changed %s', (_label, addresses) => {
    expect(hasValidMainnetSenderBinding({ review, ...addresses })).toBe(false);
  });
});
