import type { Address } from 'viem';

import type { MainnetReviewEnvelope } from './mainnet-review-envelope';

/** Pure sender binding used before any vault callback or signing primitive. */
export function hasValidMainnetSenderBinding(input: {
  review: MainnetReviewEnvelope;
  activeWalletAddress: Address;
  signerAddress: Address;
}): boolean {
  const sender = input.review.senderAddress.toLowerCase();
  return sender === input.activeWalletAddress.toLowerCase() && sender === input.signerAddress.toLowerCase();
}
