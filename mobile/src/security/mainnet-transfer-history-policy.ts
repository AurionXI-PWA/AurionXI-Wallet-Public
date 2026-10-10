import type { Address } from 'viem';
import { isSwapOperationMetadata } from './mainnet-swap-policy';
import type { MainnetSubmissionRecord } from '@/storage/mainnet-submission-journal';

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const HASH = /^0x[0-9a-fA-F]{64}$/;

/** Public metadata validation only. No native bridge or storage dependency. */
export function isMainnetSubmissionRecord(value: unknown, expectedSender?: Address): value is MainnetSubmissionRecord {
  if (!value || typeof value !== 'object') return false;
  const record = value as Partial<MainnetSubmissionRecord>;
  return record.version === 1 && record.chainId === 56
    && typeof record.transactionHash === 'string' && HASH.test(record.transactionHash)
    && typeof record.senderAddress === 'string' && ADDRESS.test(record.senderAddress)
    && (!expectedSender || record.senderAddress.toLowerCase() === expectedSender.toLowerCase())
    && typeof record.recipientAddress === 'string' && ADDRESS.test(record.recipientAddress)
    && (record.assetId === 'native-bnb' || record.assetId === 'arxi' || record.assetId === 'usdt')
    && (record.operation === undefined || isSwapOperationMetadata(record.operation) && record.operation.inputAsset === record.assetId && record.replacesTransactionHash === undefined && record.senderAddress.toLowerCase() === record.recipientAddress.toLowerCase() && record.amountWei === (record.operation.kind === 'reset' ? '0' : record.operation.intentAmountWei) && (record.receiptState !== 'confirmed' || record.operation.kind !== 'swap' || record.operation.receivedAmountWei !== undefined))
    && (record.operation?.kind === 'reset' ? record.amountWei === '0' && record.replacesTransactionHash === undefined : (record.replacesTransactionHash === undefined
      ? record.replacementKind === undefined && typeof record.amountWei === 'string' && /^[1-9][0-9]{0,77}$/.test(record.amountWei)
      : typeof record.replacesTransactionHash === 'string' && HASH.test(record.replacesTransactionHash) && record.replacesTransactionHash.toLowerCase() !== record.transactionHash.toLowerCase() && (record.replacementKind === 'cancel' ? record.assetId === 'native-bnb' && record.amountWei === '0' && record.senderAddress.toLowerCase() === record.recipientAddress.toLowerCase() : record.replacementKind === 'speed-up' && typeof record.amountWei === 'string' && /^[1-9][0-9]{0,77}$/.test(record.amountWei))))
    && (record.cancelledByHash === undefined || (record.receiptState === 'cancelled' && typeof record.cancelledByHash === 'string' && HASH.test(record.cancelledByHash)))
    && Number.isSafeInteger(record.nonce) && Number(record.nonce) >= 0
    && Number.isSafeInteger(record.submittedAt) && Number(record.submittedAt) > 0
    && ['submitted', 'pending', 'confirmed', 'reverted', 'replaced-or-dropped', 'status-unavailable', 'submission-unknown', 'not-submitted', 'cancelled'].includes(String(record.receiptState))
    && (record.blockNumber === undefined || (typeof record.blockNumber === 'string' && /^(0|[1-9][0-9]*)$/.test(record.blockNumber)))
    && (record.lastCheckedAt === undefined || (Number.isSafeInteger(record.lastCheckedAt) && Number(record.lastCheckedAt) > 0));
}

/** A public cache can improve pending display, but cannot fabricate a terminal native result. */
export function mergeMainnetTransferHistory(native: readonly MainnetSubmissionRecord[], cached: readonly MainnetSubmissionRecord[]): MainnetSubmissionRecord[] {
  const merged = new Map(cached.map((record) => [record.transactionHash.toLowerCase(),
    ['confirmed', 'reverted', 'replaced-or-dropped', 'not-submitted', 'cancelled'].includes(record.receiptState)
      ? { ...record, receiptState: 'status-unavailable' as const, blockNumber: undefined, cancelledByHash: undefined } : record]));
  native.forEach((record) => {
    const previous = merged.get(record.transactionHash.toLowerCase());
    merged.set(record.transactionHash.toLowerCase(), record.receiptState === 'status-unavailable' && previous
      && ['submitted', 'pending', 'submission-unknown', 'status-unavailable'].includes(previous.receiptState)
      ? { ...record, receiptState: previous.receiptState, lastCheckedAt: previous.lastCheckedAt } : record);
  });
  return [...merged.values()].sort((a, b) => b.submittedAt - a.submittedAt).slice(0, 20);
}
