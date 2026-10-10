import type { MainnetReviewEnvelope } from './mainnet-review-envelope';

export type MainnetUnsignedTransaction = Readonly<{
  chainId: 56;
  to: `0x${string}`;
  value: bigint;
  data: `0x${string}`;
  nonce: number;
  gas: bigint;
  gasPrice: bigint;
}>;

export type MainnetSigningPreparation =
  | { ok: true; transaction: MainnetUnsignedTransaction }
  | { ok: false; reason: 'unsupported-asset' | 'invalid-review-envelope' };

export type MainnetLocalSigningResult = {
  ok: false;
  reason: 'mainnet-signing-not-released';
  transactionFingerprint: string;
};

function padWord(value: bigint): string {
  return value.toString(16).padStart(64, '0');
}

function addressWord(address: `0x${string}`): string {
  return address.slice(2).toLowerCase().padStart(64, '0');
}

/**
 * Converts the immutable review envelope into deterministic unsigned
 * transaction bytes. No account key, mnemonic, PIN, biometric wrapping key,
 * storage, RPC client or broadcaster is accepted by this module.
 */
export function prepareUnsignedMainnetTransaction(review: MainnetReviewEnvelope): MainnetSigningPreparation {
  if (review.chainId !== 56 || review.nonce < 0 || review.gas <= 0n || review.gasPrice <= 0n || review.amount <= 0n) {
    return { ok: false, reason: 'invalid-review-envelope' };
  }
  if (review.assetId === 'native-bnb' && review.assetContract === null) {
    return {
      ok: true,
      transaction: { chainId: 56, to: review.recipient, value: review.amount, data: '0x', nonce: review.nonce, gas: review.gas, gasPrice: review.gasPrice },
    };
  }
  if (review.assetId === 'arxi' && review.assetContract) {
    return {
      ok: true,
      transaction: {
        chainId: 56,
        to: review.assetContract,
        value: 0n,
        data: `0xa9059cbb${addressWord(review.recipient)}${padWord(review.amount)}`,
        nonce: review.nonce,
        gas: review.gas,
        gasPrice: review.gasPrice,
      },
    };
  }
  return { ok: false, reason: 'unsupported-asset' };
}

/**
 * Stable non-secret identifier for receipt and duplicate-prevention state.
 * It is not a signature, private key, address derivation result, or hash of
 * wallet material.
 */
export function getMainnetTransactionFingerprint(transaction: MainnetUnsignedTransaction): string {
  return [
    transaction.chainId,
    transaction.to.toLowerCase(),
    transaction.value.toString(10),
    transaction.data.toLowerCase(),
    transaction.nonce,
    transaction.gas.toString(10),
    transaction.gasPrice.toString(10),
  ].join(':');
}

/**
 * Deliberately non-operational until a dedicated audited Mainnet signing
 * release is approved. Keeping the adapter here makes the future release
 * integration explicit without giving this preview an implicit signer.
 */
export function requestLocalMainnetSignature(transaction: MainnetUnsignedTransaction): MainnetLocalSigningResult {
  return { ok: false, reason: 'mainnet-signing-not-released', transactionFingerprint: getMainnetTransactionFingerprint(transaction) };
}
