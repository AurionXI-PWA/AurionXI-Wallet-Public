import { describe, expect, it } from 'vitest';
import { canReviewMainnetReplacement } from './mainnet-replacement-actions';
import { isMainnetSubmissionRecord, mergeMainnetTransferHistory } from './mainnet-transfer-history-policy';
import { getMainnetActivityRows } from './mainnet-activity-entries';
import { presentMainnetSubmission } from './mainnet-receipt-presentation';
import { getMainnetBoundReviewFingerprint } from './mainnet-review-envelope';
import type { MainnetSubmissionRecord } from '../storage/mainnet-submission-journal';
const original: MainnetSubmissionRecord = { version: 1, chainId: 56, transactionHash: `0x${'a'.repeat(64)}`, senderAddress: '0x1111111111111111111111111111111111111111', recipientAddress: '0x2222222222222222222222222222222222222222', assetId: 'usdt', amountWei: '1000000000000000001', nonce: 6, submittedAt: 100, receiptState: 'submission-unknown' };
const cancellation: MainnetSubmissionRecord = { ...original, transactionHash: `0x${'b'.repeat(64)}`, recipientAddress: original.senderAddress, amountWei: '0', assetId: 'native-bnb', replacesTransactionHash: original.transactionHash, replacementKind: 'cancel' };
describe('Mainnet replacement actions', () => {
  it('allows both choices for an uncertain original, but blocks terminal records and keeps fresh choices available on the original while a replacement is pending', () => {
    expect(canReviewMainnetReplacement(original, [original])).toBe(true);
    for (const receiptState of ['confirmed', 'reverted', 'cancelled', 'not-submitted'] as const) expect(canReviewMainnetReplacement({ ...original, receiptState }, [])).toBe(false);
    expect(canReviewMainnetReplacement(cancellation, [])).toBe(false);
    expect(canReviewMainnetReplacement(original, [original, cancellation])).toBe(true);
    expect(canReviewMainnetReplacement(original, [original, { ...cancellation, receiptState: 'not-submitted' }])).toBe(true);
    expect(canReviewMainnetReplacement(original, [])).toBe(false);
    expect(canReviewMainnetReplacement(original, [{ ...original, receiptState: 'confirmed' }])).toBe(false);
  });
  it('zero BNB is valid only as a hash-bound self cancellation, retry remains an exact positive asset transfer', () => {
    expect(isMainnetSubmissionRecord(cancellation)).toBe(true);
    for (const change of [{ replacementKind: undefined }, { replacesTransactionHash: undefined }, { recipientAddress: original.recipientAddress }, { assetId: 'usdt' }, { amountWei: '1' }, { replacesTransactionHash: cancellation.transactionHash }]) expect(isMainnetSubmissionRecord({ ...cancellation, ...change })).toBe(false);
    expect(isMainnetSubmissionRecord({ ...original, transactionHash: cancellation.transactionHash, replacesTransactionHash: original.transactionHash, replacementKind: 'speed-up' })).toBe(true);
    expect(isMainnetSubmissionRecord({ ...original, amountWei: '0' })).toBe(false);
  });
  it('only native history can establish that another hash won the nonce', () => {
    const replaced = { ...original, receiptState: 'cancelled' as const, cancelledByHash: cancellation.transactionHash };
    expect(mergeMainnetTransferHistory([], [replaced])[0]).toMatchObject({ receiptState: 'status-unavailable', cancelledByHash: undefined });
    expect(mergeMainnetTransferHistory([replaced], [original])[0]).toEqual(replaced);
    expect(presentMainnetSubmission(replaced).detail).toContain(cancellation.transactionHash);
  });
  it('shows cancellation confirmation distinctly, including after joining public self events', () => {
    const record = { ...cancellation, receiptState: 'confirmed' as const };
    expect(presentMainnetSubmission(record).title).toBe('Cancellation confirmed');
    const rows = getMainnetActivityRows({ key: record.transactionHash, hash: record.transactionHash, timestamp: 100, record,
      items: [{ id: 'self', hash: record.transactionHash, direction: 'Self', counterparty: record.senderAddress, symbol: 'BNB', amount: '0', failed: false, blockNumber: '1', timestamp: new Date(100) }] });
    expect(rows[0].direction).toBe('Cancellation confirmed');
  });
  it('binds replacement choice and original hash into the native review fingerprint', () => {
    const review = { chainId: 56 as const, senderAddress: original.senderAddress, recipient: original.recipientAddress, assetId: 'usdt', assetContract: '0x55d398326f99059fF775485246999027B3197955' as const, amount: 1n, nonce: 6, gas: 160000n, gasPrice: 100000000n, observedAt: 100, replacesTransactionHash: original.transactionHash, replacementKind: 'speed-up' as const };
    expect(getMainnetBoundReviewFingerprint(review)).not.toBe(getMainnetBoundReviewFingerprint({ ...review, replacementKind: 'cancel' }));
    expect(getMainnetBoundReviewFingerprint(review)).not.toBe(getMainnetBoundReviewFingerprint({ ...review, replacesTransactionHash: cancellation.transactionHash }));
  });
});
