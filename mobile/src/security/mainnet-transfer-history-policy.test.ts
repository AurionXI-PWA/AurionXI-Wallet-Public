import { describe, expect, it } from 'vitest';
import { isMainnetSubmissionRecord, mergeMainnetTransferHistory } from './mainnet-transfer-history-policy';
import type { MainnetSubmissionRecord } from '@/storage/mainnet-submission-journal';

const record: MainnetSubmissionRecord = { version: 1, chainId: 56, transactionHash: `0x${'a'.repeat(64)}`,
  senderAddress: '0x1111111111111111111111111111111111111111', recipientAddress: '0x2222222222222222222222222222222222222222',
  assetId: 'arxi', amountWei: '5000000000000000000', nonce: 1, submittedAt: 100, receiptState: 'submission-unknown' };

describe('Mainnet native public history policy', () => {
  it('validates the three supported assets and rejects another sender, chain or unsafe nonce', () => {
    expect(isMainnetSubmissionRecord(record, record.senderAddress)).toBe(true);
    expect(isMainnetSubmissionRecord({ ...record, assetId: 'native-bnb' })).toBe(true);
    expect(isMainnetSubmissionRecord({ ...record, assetId: 'usdt' })).toBe(true);
    expect(isMainnetSubmissionRecord({ ...record, assetId: 'usdc' })).toBe(false);
    expect(isMainnetSubmissionRecord(record, record.recipientAddress)).toBe(false);
    expect(isMainnetSubmissionRecord({ ...record, chainId: 97 })).toBe(false);
    expect(isMainnetSubmissionRecord({ ...record, nonce: Number.MAX_SAFE_INTEGER + 1 })).toBe(false);
  });
  it('never replaces an uncertain native record with a cached terminal success', () => {
    const result = mergeMainnetTransferHistory([{ ...record, receiptState: 'status-unavailable' }], [{ ...record, receiptState: 'confirmed', blockNumber: '123' }]);
    expect(result[0].receiptState).toBe('status-unavailable');
    expect(result[0].blockNumber).toBeUndefined();
  });
  it('recovers durable native confirmation after a process restart or lost display cache', () => {
    expect(mergeMainnetTransferHistory([{ ...record, receiptState: 'confirmed' }], [record])[0].receiptState).toBe('confirmed');
    expect(mergeMainnetTransferHistory([record], [])).toEqual([record]);
  });
  it('requires native reconciliation before displaying a cache-only terminal result', () => {
    expect(mergeMainnetTransferHistory([], [{ ...record, receiptState: 'confirmed', blockNumber: '123' }])[0].receiptState).toBe('status-unavailable');
  });
  it('keeps uncertainty visible and merges hashes case-insensitively', () => {
    const result = mergeMainnetTransferHistory([{ ...record, transactionHash: `0x${'A'.repeat(64)}`, receiptState: 'status-unavailable' }], [record]);
    expect(result).toHaveLength(1);
    expect(result[0].receiptState).toBe('submission-unknown');
  });
});
