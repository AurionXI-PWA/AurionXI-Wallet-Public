import { describe, expect, it } from 'vitest';
import { createSubmittedMainnetRecord, type MainnetSubmissionRecord } from '@/storage/mainnet-submission-journal';
import { getMainnetTransactionExplorerUrl, presentMainnetSubmission } from './mainnet-receipt-presentation';

const submitted = createSubmittedMainnetRecord({ transactionHash: `0x${'ab'.repeat(32)}`, senderAddress: '0x1111111111111111111111111111111111111111', recipientAddress: '0x2222222222222222222222222222222222222222', assetId: 'native-bnb', amountWei: '1', nonce: 3, submittedAt: 100 });
const state = (receiptState: MainnetSubmissionRecord['receiptState'], blockNumber?: string): MainnetSubmissionRecord => ({ ...submitted, receiptState, blockNumber });

describe('Mainnet receipt recovery presentation', () => {
  it.each([
    ['submitted', true], ['pending', true], ['confirmed', false], ['reverted', false], ['replaced-or-dropped', false], ['status-unavailable', true], ['submission-unknown', true], ['not-submitted', false],
  ] as const)('presents %s with correct refresh policy', (receiptState, refreshAllowed) => {
    expect(presentMainnetSubmission(state(receiptState, receiptState === 'confirmed' ? '50' : undefined)).refreshAllowed).toBe(refreshAllowed);
  });
  it('creates only a canonical BscScan transaction link', () => {
    expect(getMainnetTransactionExplorerUrl(submitted.transactionHash)).toBe(`https://bscscan.com/tx/${submitted.transactionHash}`);
    expect(() => getMainnetTransactionExplorerUrl('0xbad')).toThrow(/hash/i);
  });
  it('distinguishes uncertainty from a known non-submission and never invents a block', () => {
    expect(presentMainnetSubmission(state('submission-unknown')).detail).toMatch(/do not|another/i);
    expect(presentMainnetSubmission(state('confirmed')).detail).not.toContain('undefined');
    expect(presentMainnetSubmission(state('not-submitted')).refreshAllowed).toBe(false);
  });
});
