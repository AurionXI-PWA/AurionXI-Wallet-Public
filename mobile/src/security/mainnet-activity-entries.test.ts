import { describe, expect, it } from 'vitest';
import type { Hash } from 'viem';
import type { MainnetActivityItem } from '../services/mainnet-activity';
import type { MainnetSubmissionRecord } from '../storage/mainnet-submission-journal';
import { getMainnetActivityRows, mergeMainnetActivityEntries, presentMainnetActivityEntry } from './mainnet-activity-entries';
import { getMainnetTransactionExplorerUrl } from './mainnet-receipt-presentation';

const sender = '0x1111111111111111111111111111111111111111';
const recipient = '0x2222222222222222222222222222222222222222';
const firstHash: Hash = `0x${'ab'.repeat(32)}`;
const secondHash: Hash = `0x${'cd'.repeat(32)}`;
const item = (overrides: Partial<MainnetActivityItem> = {}): MainnetActivityItem => ({
  id: 'event-0', hash: firstHash, blockNumber: '50', timestamp: new Date(2_000),
  direction: 'Sent', counterparty: recipient, amount: '5', symbol: 'ARXI', failed: false, ...overrides,
});
const record = (overrides: Partial<MainnetSubmissionRecord> = {}): MainnetSubmissionRecord => ({
  version: 1, chainId: 56, transactionHash: firstHash, senderAddress: sender, recipientAddress: recipient,
  assetId: 'arxi', amountWei: '5000000000000000000', nonce: 1, submittedAt: 1_000, receiptState: 'confirmed', ...overrides,
});

describe('Mainnet transaction-owned Activity entries', () => {
  it('merges public activity and native receipt into one card by exact case-insensitive hash', () => {
    const result = mergeMainnetActivityEntries([item()], [record({ transactionHash: `0x${'AB'.repeat(32)}` })], sender);
    expect(result).toHaveLength(1);
    expect(result[0].record?.receiptState).toBe('confirmed');
    expect(result[0].items).toHaveLength(1);
    expect(result[0].timestamp).toBe(2_000);
    expect(getMainnetTransactionExplorerUrl(result[0].hash)).toBe(`https://bscscan.com/tx/${firstHash}`);
  });
  it('does not join different hashes just because amount, recipient and date match', () => {
    const result = mergeMainnetActivityEntries([item()], [record({ transactionHash: secondHash })], sender);
    expect(result).toHaveLength(2);
    expect(result.find((entry) => entry.hash === firstHash)?.record).toBeUndefined();
    expect(result.find((entry) => entry.hash === secondHash)?.items).toHaveLength(0);
  });
  it('retains multiple token events within a single transaction and removes only repeated event IDs', () => {
    const received = item({ id: 'event-1', direction: 'Received', symbol: 'BNB', amount: '0.01' });
    const result = mergeMainnetActivityEntries([item(), item(), received], [record()], sender);
    expect(result).toHaveLength(1);
    expect(getMainnetActivityRows(result[0]).map((row) => [row.direction, row.amount, row.symbol])).toEqual([
      ['Sent', '5', 'ARXI'], ['Received', '0.01', 'BNB'],
    ]);
  });
  it('keeps reused event IDs in different transactions independent', () => {
    expect(mergeMainnetActivityEntries([item(), item({ hash: secondHash })], [], sender)).toHaveLength(2);
  });
  it('shows exact native-only ARXI/BNB amounts while public history is missing', () => {
    const result = mergeMainnetActivityEntries([], [record(), record({ transactionHash: secondHash, assetId: 'native-bnb', amountWei: '1' })], sender);
    expect(getMainnetActivityRows(result.find((entry) => entry.hash === firstHash)!)[0]).toMatchObject({ direction: 'Sent', amount: '5', symbol: 'ARXI' });
    expect(getMainnetActivityRows(result.find((entry) => entry.hash === secondHash)!)[0]).toMatchObject({ amount: '0.000000000000000001', symbol: 'BNB' });
  });
  it('shows USDT amounts and an exact-hash link without creating a separate receipt card', () => {
    const [entry] = mergeMainnetActivityEntries([], [record({ assetId: 'usdt', amountWei: '1000000000000000001' })], sender);
    expect(getMainnetActivityRows(entry)[0]).toMatchObject({ symbol: 'USDT', amount: '1.000000000000000001' });
    expect(getMainnetTransactionExplorerUrl(entry.hash)).toBe(`https://bscscan.com/tx/${firstHash}`);
    const [received] = mergeMainnetActivityEntries([item({ direction: 'Received', symbol: 'USDT' })], [], sender);
    expect(getMainnetActivityRows(received)[0]).toMatchObject({ direction: 'Received', symbol: 'USDT', counterpartyLabel: 'From' });
  });
  it('does not upgrade unknown submission to confirmed from public activity', () => {
    const [entry] = mergeMainnetActivityEntries([item()], [record({ receiptState: 'submission-unknown' })], sender);
    expect(presentMainnetActivityEntry(entry)).toMatchObject({ title: 'Submission status unknown', tone: 'warning', refreshAllowed: true });
    expect(getMainnetActivityRows(entry)[0].direction).toBe('Send attempt');
  });
  it.each(['not-submitted', 'status-unavailable', 'replaced-or-dropped'] as const)('does not label native-only %s as Sent', (receiptState) => {
    const [entry] = mergeMainnetActivityEntries([], [record({ receiptState })], sender);
    expect(getMainnetActivityRows(entry)[0].direction).toBe('Send attempt');
    expect(presentMainnetActivityEntry(entry).tone).toBe('warning');
  });
  it('keeps incoming public activity linked without fabricating native receipt verification', () => {
    const [entry] = mergeMainnetActivityEntries([item({ direction: 'Received' })], [], sender);
    expect(getMainnetActivityRows(entry)[0].direction).toBe('Received');
    expect(presentMainnetActivityEntry(entry).title).toBe('On-chain activity');
    expect(presentMainnetActivityEntry(entry).detail).toContain('not independently');
    expect(getMainnetTransactionExplorerUrl(entry.hash)).toContain(firstHash);
  });
  it('rejects foreign-wallet native records and malformed hashes/dates', () => {
    const result = mergeMainnetActivityEntries([item({ hash: '0xinvalid' }), item({ timestamp: new Date('invalid') })], [record({ senderAddress: recipient })], sender);
    expect(result).toEqual([]);
  });
  it('skips corrupt public display metadata instead of passing broken addresses to the card', () => {
    expect(mergeMainnetActivityEntries([item({ counterparty: '0xinvalid' }), item({ amount: 'not-a-number' })], [], sender)).toEqual([]);
  });
  it('retains the sender label for a failed incoming event', () => {
    const [entry] = mergeMainnetActivityEntries([item({ direction: 'Received', failed: true })], [], sender);
    expect(getMainnetActivityRows(entry)[0]).toMatchObject({ direction: 'Failed', counterpartyLabel: 'From' });
  });
  it('puts unresolved transfers first, then orders other entries by newest transaction time', () => {
    const thirdHash: Hash = `0x${'ef'.repeat(32)}`;
    const result = mergeMainnetActivityEntries([item(), item({ hash: secondHash, timestamp: new Date(3_000) })], [record({ transactionHash: thirdHash, receiptState: 'pending', submittedAt: 100 })], sender);
    expect(result.map((entry) => entry.hash)).toEqual([thirdHash, secondHash, firstHash]);
    expect(getMainnetActivityRows(result[0])[0].direction).toBe('Sending');
  });
  it('renders no entries without a current unlocked wallet address', () => {
    expect(mergeMainnetActivityEntries([item()], [record()])).toEqual([]);
  });
  it('does not erase a newer native receipt when duplicate records are supplied', () => {
    const [entry] = mergeMainnetActivityEntries([], [record({ lastCheckedAt: 3_000 }), record({ receiptState: 'pending', lastCheckedAt: 2_000 })], sender);
    expect(entry.record?.receiptState).toBe('confirmed');
  });
  it('makes conflicting public failure/native success visible instead of silently claiming agreement', () => {
    const [entry] = mergeMainnetActivityEntries([item({ failed: true })], [record()], sender);
    expect(presentMainnetActivityEntry(entry)).toMatchObject({ title: 'Activity details differ', tone: 'warning' });
  });
});
