import type { Address, Hash } from 'viem';

const STATES = ['RESERVED', 'SIGNING', 'SIGNED_UNVERIFIED', 'SIGNED', 'SUBMITTED'] as const;
const REASONS = ['clear', 'snapshot_unavailable', 'submitted_receipt_required', 'multiple_records', 'nonce_mismatch', 'never_submitted_retry_available'] as const;
export type MainnetRecoveryState = typeof STATES[number];
export type MainnetRecoveryReason = typeof REASONS[number];
export type MainnetRecoveryRecord = Readonly<{ nonce: string; state: MainnetRecoveryState; transactionHash: Hash | null; replacesTransactionHash?: Hash }>;
export type MainnetRecoveryDiagnostics = Readonly<{
  chainId: 56; senderAddress: Address; reviewedNonce: string; livePendingNonce: string | null;
  recordCount: number; reason: MainnetRecoveryReason; records: readonly MainnetRecoveryRecord[];
}>;

const HASH = /^0x[a-fA-F0-9]{64}$/;
const NONCE = /^(0|[1-9][0-9]{0,18})$/;
/** Status-only receipt recovery is valid for any unresolved hash-bearing signed record. */
export function canCheckMainnetRecoveryReceipt(record: MainnetRecoveryRecord): boolean {
  return ['SIGNED_UNVERIFIED', 'SIGNED', 'SUBMITTED'].includes(record.state)
    && typeof record.transactionHash === 'string' && HASH.test(record.transactionHash);
}

const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid native recovery diagnostics.');
  return value as Record<string, unknown>;
};

/** Whitelist public fields; never forward a native authorization or payload. */
export function parseMainnetRecoveryDiagnostics(value: unknown, sender: Address, reviewedNonce: number): MainnetRecoveryDiagnostics {
  const input = object(value);
  if (input.chainId !== 56 || typeof input.senderAddress !== 'string' || input.senderAddress.toLowerCase() !== sender.toLowerCase()
    || input.reviewedNonce !== String(reviewedNonce)
    || !(input.livePendingNonce === null || (typeof input.livePendingNonce === 'string' && NONCE.test(input.livePendingNonce)))
    || !Number.isSafeInteger(input.recordCount) || Number(input.recordCount) < 0
    || !Array.isArray(input.records) || input.records.length !== Math.min(Number(input.recordCount), 32)
    || !REASONS.includes(input.reason as MainnetRecoveryReason)) throw new Error('Invalid native recovery diagnostics.');
  const records = input.records.map((value): MainnetRecoveryRecord => {
    const record = object(value);
    if (typeof record.nonce !== 'string' || !NONCE.test(record.nonce) || !STATES.includes(record.state as MainnetRecoveryState)
      || !(record.transactionHash === null || (typeof record.transactionHash === 'string' && HASH.test(record.transactionHash)))
      || (['SIGNED_UNVERIFIED', 'SIGNED', 'SUBMITTED'].includes(String(record.state)) && record.transactionHash === null)) {
      throw new Error('Invalid native recovery record.');
    }
    if (record.replacesTransactionHash !== undefined && (typeof record.replacesTransactionHash !== 'string' || !HASH.test(record.replacesTransactionHash))) throw new Error('Invalid cancellation recovery pointer.');
    return Object.freeze({ ...(record.replacesTransactionHash ? { replacesTransactionHash: record.replacesTransactionHash as Hash } : {}), nonce: record.nonce, state: record.state as MainnetRecoveryState, transactionHash: record.transactionHash as Hash | null });
  });
  if (new Set(records.map((record) => `${record.nonce}:${record.replacesTransactionHash ?? 'original'}:${record.transactionHash ?? 'unsigned'}`)).size !== records.length) throw new Error('Duplicate native recovery record.');
  return Object.freeze({ chainId: 56, senderAddress: sender, reviewedNonce: String(reviewedNonce), livePendingNonce: input.livePendingNonce as string | null,
    recordCount: Number(input.recordCount), reason: input.reason as MainnetRecoveryReason, records: Object.freeze(records) });
}
