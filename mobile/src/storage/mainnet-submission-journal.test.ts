import { describe, expect, it } from 'vitest';

import { applyMainnetReceiptState, createSubmittedMainnetRecord, isMainnetSubmissionRecord } from './mainnet-submission-journal';

const hash = `0x${'ab'.repeat(32)}` as const;
const record = createSubmittedMainnetRecord({
  transactionHash: hash,
  senderAddress: '0x1111111111111111111111111111111111111111',
  recipientAddress: '0x2222222222222222222222222222222222222222',
  assetId: 'arxi', amountWei: '10', nonce: 3, submittedAt: 100,
});

describe('Mainnet public submission journal', () => {
  it('creates strict public-only submission metadata', () => {
    expect(record).toMatchObject({ version: 1, chainId: 56, receiptState: 'submitted', transactionHash: hash });
    expect(isMainnetSubmissionRecord(record, record.senderAddress)).toBe(true);
    expect(record).not.toHaveProperty('rawTransaction');
  });

  it('rejects corrupted, cross-wallet, unsupported-asset, and invalid quantity records', () => {
    expect(isMainnetSubmissionRecord({ ...record, senderAddress: record.recipientAddress }, record.senderAddress)).toBe(false);
    expect(isMainnetSubmissionRecord({ ...record, assetId: 'usdc' }, record.senderAddress)).toBe(false);
    expect(isMainnetSubmissionRecord({ ...record, amountWei: '0' }, record.senderAddress)).toBe(false);
    expect(isMainnetSubmissionRecord({ ...record, transactionHash: '0xbad' }, record.senderAddress)).toBe(false);
  });

  it('preserves exact USDT amounts and transaction identity through receipt recovery', () => {
    const usdt = createSubmittedMainnetRecord({
      transactionHash: hash, senderAddress: record.senderAddress, recipientAddress: record.recipientAddress,
      assetId: 'usdt', amountWei: '1000000000000000001', nonce: 4, submittedAt: 101,
    });
    expect(isMainnetSubmissionRecord(usdt, usdt.senderAddress)).toBe(true);
    const recovered = applyMainnetReceiptState(usdt, {
      state: 'status-unavailable', transactionHash: hash, checkedAt: 202,
    });
    expect(recovered).toMatchObject({ assetId: 'usdt', amountWei: '1000000000000000001', transactionHash: hash });
    const confirmed = applyMainnetReceiptState(recovered, {
      state: 'confirmed', transactionHash: hash, blockNumber: 14n, confirmedAt: 203,
    });
    expect(confirmed).toMatchObject({ assetId: 'usdt', amountWei: '1000000000000000001', receiptState: 'confirmed', blockNumber: '14' });
    expect(isMainnetSubmissionRecord(confirmed, usdt.senderAddress)).toBe(true);
  });
  it('updates only the matching hash with confirmed, reverted, and recovery states', () => {
    expect(applyMainnetReceiptState(record, { state: 'confirmed', transactionHash: hash, blockNumber: 12n, confirmedAt: 200 })).toMatchObject({ receiptState: 'confirmed', blockNumber: '12', lastCheckedAt: 200 });
    expect(applyMainnetReceiptState(record, { state: 'reverted', transactionHash: hash, blockNumber: 13n, confirmedAt: 201 })).toMatchObject({ receiptState: 'reverted', blockNumber: '13' });
    expect(applyMainnetReceiptState(record, { state: 'status-unavailable', transactionHash: hash, checkedAt: 202 })).toMatchObject({ receiptState: 'status-unavailable', lastCheckedAt: 202 });
    expect(() => applyMainnetReceiptState(record, { state: 'pending', transactionHash: `0x${'cd'.repeat(32)}`, submittedAt: 100, checkedAt: 200 })).toThrow(/hash/i);
  });
});
