import type { MainnetSubmissionRecord } from '../storage/mainnet-submission-journal';
export function canReviewMainnetReplacement(record: MainnetSubmissionRecord, nativeRecords: readonly MainnetSubmissionRecord[]): boolean {
  if (record.operation) return false;
  return nativeRecords.some(native => native.transactionHash.toLowerCase() === record.transactionHash.toLowerCase() && native.senderAddress.toLowerCase() === record.senderAddress.toLowerCase() && native.nonce === record.nonce && ['submitted', 'pending', 'submission-unknown', 'status-unavailable'].includes(native.receiptState)) && !record.replacesTransactionHash && ['submitted', 'pending', 'submission-unknown', 'status-unavailable'].includes(record.receiptState);
}
