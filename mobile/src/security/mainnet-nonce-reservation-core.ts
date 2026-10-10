import type { Address, Hash } from 'viem';

/** Durable record shape for a future native/database-backed broadcast journal. */
export type MainnetNonceReservation = Readonly<{
  chainId: 56;
  senderAddress: Address;
  nonce: number;
  reviewFingerprint: string;
  authorizationId: string;
  status: 'reserved' | 'submitted' | 'confirmed' | 'reverted' | 'dropped';
  rawTransactionHash?: Hash;
  attemptCount: number;
  replacementOf?: string;
}>;

/** Implementations must make reserve atomic for chainId + senderAddress + nonce. */
export type MainnetNonceReservationStore = Readonly<{
  reserveAtomically: (record: MainnetNonceReservation) => Promise<'reserved' | 'already-reserved'>;
  markSubmitted: (input: { chainId: 56; senderAddress: Address; nonce: number; rawTransactionHash: Hash }) => Promise<void>;
}>;

/**
 * Validates the only record that a production broadcaster may reserve.
 * This file performs no persistence, signing, RPC call, or broadcast.
 */
export function createMainnetNonceReservation(input: Omit<MainnetNonceReservation, 'status' | 'attemptCount'>): MainnetNonceReservation {
  if (input.chainId !== 56 || !Number.isSafeInteger(input.nonce) || input.nonce < 0 || !input.reviewFingerprint || !input.authorizationId) {
    throw new Error('Invalid Mainnet nonce reservation.');
  }
  return Object.freeze({ ...input, status: 'reserved', attemptCount: 0 });
}
