import type { Address } from 'viem';

import type { MainnetReviewEnvelope } from './mainnet-review-envelope';

/** Live public RPC values fetched immediately before a future signature. */
export type MainnetPreSignSnapshot = Readonly<{
  chainId: number;
  senderAddress: Address;
  pendingNonce: number;
  gasLimit: bigint;
  gasPrice: bigint;
}>;

export type MainnetPreSignRevalidation = { ok: true } | { ok: false; reason: 'chain-changed' | 'sender-changed' | 'nonce-changed' | 'gas-changed' | 'fee-changed' };

/** Exact equality is intentional: a changed public quote must force a new review. */
export function revalidateMainnetReviewImmediatelyBeforeSigning(review: MainnetReviewEnvelope, live: MainnetPreSignSnapshot): MainnetPreSignRevalidation {
  if (live.chainId !== 56) return { ok: false, reason: 'chain-changed' };
  if (live.senderAddress.toLowerCase() !== review.senderAddress.toLowerCase()) return { ok: false, reason: 'sender-changed' };
  if (live.pendingNonce !== review.nonce) return { ok: false, reason: 'nonce-changed' };
  if (live.gasLimit !== review.gas) return { ok: false, reason: 'gas-changed' };
  if (live.gasPrice !== review.gasPrice) return { ok: false, reason: 'fee-changed' };
  return { ok: true };
}
