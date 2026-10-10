import { keccak256, toHex, type Address, type Hash } from 'viem';

import type { MainnetFeeReadiness } from './mainnet-fee-readiness';
import type { ValidatedMainnetTransactionIntent } from './mainnet-transaction-intent-policy';

export type MainnetPublicTransactionSnapshot = {
  chainId: 56;
  nonce: bigint;
  gasPriceWei: bigint;
  observedAt: number;
};

export type MainnetReviewEnvelope = {
  chainId: 56;
  /** Wallet that supplied the nonce/balance quote and must produce the signature. */
  senderAddress: Address;
  assetId: string;
  assetContract: `0x${string}` | null;
  recipient: `0x${string}`;
  amount: bigint;
  nonce: number;
  gas: bigint;
  gasPrice: bigint;
  observedAt: number;
  replacesTransactionHash?: Hash;
  replacementKind?: 'cancel' | 'speed-up';
};

/**
 * Creates immutable, reviewed transaction data only. It does not create a
 * signature and cannot access vault material, network clients, storage, or a
 * broadcaster. Mainnet sign/broadcast stays blocked by mainnet-send-sign-boundary.
 */
export function createMainnetReviewEnvelope(input: {
  senderAddress: Address;
  intent: ValidatedMainnetTransactionIntent;
  snapshot: MainnetPublicTransactionSnapshot;
  fee: MainnetFeeReadiness;
}): MainnetReviewEnvelope {
  if (input.intent.chainId !== 56 || input.snapshot.chainId !== 56) {
    throw new Error('Only BNB Smart Chain Mainnet review envelopes are supported.');
  }
  if (input.fee.state !== 'ready') {
    throw new Error('A verified public network-fee estimate is required for review.');
  }
  if (input.fee.gasPriceWei !== input.snapshot.gasPriceWei || input.fee.feeWei !== input.fee.gasLimit * input.snapshot.gasPriceWei) {
    throw new Error('The network-fee snapshot changed. Review again.');
  }
  if (input.snapshot.nonce > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('The account nonce is out of range.');
  }
  return {
    chainId: 56,
    senderAddress: input.senderAddress,
    assetId: input.intent.asset.id,
    assetContract: input.intent.asset.address,
    recipient: input.intent.recipient,
    amount: input.intent.amount,
    nonce: Number(input.snapshot.nonce),
    gas: input.fee.gasLimit,
    gasPrice: input.snapshot.gasPriceWei,
    observedAt: input.snapshot.observedAt,
  };
}

const REVIEW_DIGEST_DOMAIN = 'aurionxi.mainnet.review.v1';

/** Canonical binary encoding for the domain-separated Mainnet review digest. */
function encodeDigestFields(fields: readonly string[]): Uint8Array {
  const encoder = new TextEncoder();
  const encoded = fields.map((field) => encoder.encode(field));
  const output = new Uint8Array(encoded.reduce((total, field) => total + 4 + field.length, 0));
  const view = new DataView(output.buffer);
  let offset = 0;
  for (const field of encoded) {
    view.setUint32(offset, field.length, false);
    offset += 4;
    output.set(field, offset);
    offset += field.length;
  }
  return output;
}

/** Sender-bound, non-secret canonical digest used by authorization and journal layers. */
export function getMainnetBoundReviewFingerprint(review: MainnetReviewEnvelope): Hash {
  if (!Number.isSafeInteger(review.nonce) || review.nonce < 0 || !Number.isSafeInteger(review.observedAt) || review.observedAt < 0) {
    throw new Error('Mainnet review contains an invalid nonce or observation time.');
  }
  return keccak256(toHex(encodeDigestFields([
    REVIEW_DIGEST_DOMAIN,
    'chainId', review.chainId.toString(),
    'sender', review.senderAddress.toLowerCase(),
    'assetId', review.assetId,
    'assetContract', review.assetContract?.toLowerCase() ?? 'native',
    'recipient', review.recipient.toLowerCase(),
    'amount', review.amount.toString(),
    'nonce', review.nonce.toString(),
    'gas', review.gas.toString(),
    'gasPrice', review.gasPrice.toString(),
    'observedAt', review.observedAt.toString(),
    ...(review.replacesTransactionHash ? ['replacesTransactionHash', review.replacesTransactionHash.toLowerCase(), 'replacementKind', review.replacementKind ?? ''] : []),
  ])));
}
