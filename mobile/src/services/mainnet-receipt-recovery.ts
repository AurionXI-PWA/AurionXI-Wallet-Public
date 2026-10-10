import type { Hash } from 'viem';

import { resolveMainnetReceipt, type MainnetReceiptState } from '@/security/mainnet-broadcast-receipt-coordinator';
import { applyMainnetReceiptState, saveMainnetSubmissionRecord, type MainnetSubmissionRecord } from '@/storage/mainnet-submission-journal';

export type MainnetReceiptObservation = Readonly<{
  receipt?: { status: 'success' | 'reverted'; blockNumber: bigint };
  transactionKnown?: boolean;
  latestConfirmedNonce?: number;
  unavailable?: boolean;
}>;

export type MainnetReceiptReader = {
  read: (input: { transactionHash: Hash; senderAddress: `0x${string}`; nonce: number }) => Promise<MainnetReceiptObservation>;
};
export type NativeReceiptReconciler = (input: { senderAddress: `0x${string}`; nonce: number; transactionHash: Hash }) => Promise<'pending' | 'confirmed' | 'reverted'>;

/**
 * Persists the relay-accepted hash before the first receipt read. The callback
 * receives no serialized transaction and therefore cannot rebroadcast it.
 */
export async function persistThenReadMainnetReceipt(input: {
  record: MainnetSubmissionRecord;
  reader: MainnetReceiptReader;
  now: number;
  persist?: (record: MainnetSubmissionRecord) => Promise<void>;
  reconcileNative?: NativeReceiptReconciler;
}): Promise<MainnetSubmissionRecord> {
  const persist = input.persist ?? saveMainnetSubmissionRecord;
  await persist(input.record);
  return refreshPersistedMainnetReceipt({ ...input, persist });
}

/** Refreshes public status only; no raw transaction or submit capability exists. */
export async function refreshPersistedMainnetReceipt(input: {
  record: MainnetSubmissionRecord;
  reader: MainnetReceiptReader;
  now: number;
  persist?: (record: MainnetSubmissionRecord) => Promise<void>;
  reconcileNative?: NativeReceiptReconciler;
}): Promise<MainnetSubmissionRecord> {
  let observation: MainnetReceiptObservation;
  try {
    observation = await input.reader.read({ transactionHash: input.record.transactionHash, senderAddress: input.record.senderAddress, nonce: input.record.nonce });
  } catch {
    observation = { unavailable: true };
  }
  const state: MainnetReceiptState = resolveMainnetReceipt({
    transactionHash: input.record.transactionHash,
    submittedAt: input.record.submittedAt,
    now: input.now,
    receipt: observation.receipt,
    transactionKnown: observation.transactionKnown,
    transactionNonce: input.record.nonce,
    latestConfirmedNonce: observation.latestConfirmedNonce,
    statusUnavailable: observation.unavailable,
  });
  const updated = applyMainnetReceiptState(input.record, state);
  if (state.state === 'confirmed' || state.state === 'reverted') {
    if (!input.reconcileNative) throw new Error('Native Mainnet receipt reconciliation is required for a terminal receipt.');
    const nativeState = await input.reconcileNative({ senderAddress: input.record.senderAddress, nonce: input.record.nonce, transactionHash: input.record.transactionHash });
    if (nativeState !== state.state) throw new Error('Native Mainnet receipt reconciliation disagreed with the public receipt.');
  }
  await (input.persist ?? saveMainnetSubmissionRecord)(updated);
  return updated;
}
