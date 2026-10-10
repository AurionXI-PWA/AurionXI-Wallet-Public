import type { MainnetUnsignedTransaction } from './mainnet-local-signing-adapter';
import { getMainnetTransactionFingerprint } from './mainnet-local-signing-adapter';

export type MainnetBroadcastState = { state: 'release-blocked'; transactionFingerprint: string; reason: 'mainnet-signing-not-released' };

export type MainnetReceiptState =
  | { state: 'submitted'; transactionHash: `0x${string}`; submittedAt: number }
  | { state: 'pending'; transactionHash: `0x${string}`; submittedAt: number; checkedAt: number }
  | { state: 'confirmed'; transactionHash: `0x${string}`; blockNumber: bigint; confirmedAt: number }
  | { state: 'reverted'; transactionHash: `0x${string}`; blockNumber: bigint; confirmedAt: number }
  | { state: 'replaced-or-dropped'; transactionHash: `0x${string}`; detectedAt: number }
  | { state: 'status-unavailable'; transactionHash: `0x${string}`; checkedAt: number }
  | { state: 'submission-unknown'; transactionHash: `0x${string}`; checkedAt: number }
  | { state: 'cancelled'; transactionHash: `0x${string}`; checkedAt: number }
  | { state: 'not-submitted'; transactionHash: `0x${string}`; checkedAt: number };

/**
 * Preview-only boundary. It never returns a state that permits a Mainnet
 * broadcaster, regardless of caller arguments or in-memory state.
 */
export function evaluateMainnetBroadcastState(input: {
  transaction: MainnetUnsignedTransaction;
}): MainnetBroadcastState {
  const transactionFingerprint = getMainnetTransactionFingerprint(input.transaction);
  return { state: 'release-blocked', transactionFingerprint, reason: 'mainnet-signing-not-released' };
}

/** Maps public receipt observations to clear UI-safe states; it never fetches them. */
export function resolveMainnetReceipt(input: {
  transactionHash: `0x${string}`;
  submittedAt: number;
  now: number;
  receipt?: { status: 'success' | 'reverted'; blockNumber: bigint };
  transactionKnown?: boolean;
  transactionNonce?: number;
  latestConfirmedNonce?: number;
  statusUnavailable?: boolean;
}): MainnetReceiptState {
  if (input.statusUnavailable) return { state: 'status-unavailable', transactionHash: input.transactionHash, checkedAt: input.now };
  if (input.receipt?.status === 'success') return { state: 'confirmed', transactionHash: input.transactionHash, blockNumber: input.receipt.blockNumber, confirmedAt: input.now };
  if (input.receipt?.status === 'reverted') return { state: 'reverted', transactionHash: input.transactionHash, blockNumber: input.receipt.blockNumber, confirmedAt: input.now };
  if (input.transactionKnown === false && input.transactionNonce !== undefined && input.latestConfirmedNonce !== undefined && input.latestConfirmedNonce > input.transactionNonce) {
    return { state: 'replaced-or-dropped', transactionHash: input.transactionHash, detectedAt: input.now };
  }
  return { state: 'pending', transactionHash: input.transactionHash, submittedAt: input.submittedAt, checkedAt: input.now };
}
