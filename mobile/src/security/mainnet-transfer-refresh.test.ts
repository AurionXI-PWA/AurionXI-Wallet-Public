import { describe, expect, it, vi } from 'vitest';
import type { Address, Hash } from 'viem';
import type { MainnetSubmissionRecord } from '../storage/mainnet-submission-journal';
import { refreshMainnetTransferRecords } from './mainnet-transfer-refresh';
const old: MainnetSubmissionRecord = { version: 1, chainId: 56, senderAddress: '0x1111111111111111111111111111111111111111', recipientAddress: '0x2222222222222222222222222222222222222222', transactionHash: `0x${'a'.repeat(64)}`, assetId: 'arxi', amountWei: '5000000000000000000', nonce: 1, submittedAt: 100, receiptState: 'confirmed' };
const pending: MainnetSubmissionRecord = { ...old, transactionHash: `0x${'b'.repeat(64)}`, nonce: 6, assetId: 'native-bnb', amountWei: '200000000000000', submittedAt: 200, receiptState: 'submission-unknown' };

function setup(native: MainnetSubmissionRecord[], cache: MainnetSubmissionRecord[]) {
  let visible: MainnetSubmissionRecord[] = [];
  const deps = { loadNative: vi.fn(async () => native), loadCache: vi.fn(async () => cache), inspect: vi.fn(async (_input: { senderAddress: Address; nonce: number; transactionHash: Hash }) => 'confirmed' as const), save: vi.fn(async () => undefined), verifiedLegacy: new Map<string, MainnetSubmissionRecord>(), current: () => true, publish: vi.fn((records: MainnetSubmissionRecord[]) => { visible = records; }) };
  return { deps, visible: () => visible };
}
describe('Mainnet manual receipt refresh', () => {
  it('queries a legacy cache-only ARXI hash and keeps the fresh confirmation through the final merge', async () => {
    const { deps, visible } = setup([pending], [old, pending]);
    await refreshMainnetTransferRecords(old.senderAddress, deps);
    expect(deps.inspect).toHaveBeenCalledWith({senderAddress: old.senderAddress, nonce: 1, transactionHash: old.transactionHash});
    expect(visible().find(r => r.transactionHash === old.transactionHash)?.receiptState).toBe('confirmed');
    expect(deps.publish.mock.calls[0][0].find(r => r.transactionHash === old.transactionHash)?.receiptState).toBe('status-unavailable');
  });
  it('keeps an already receipt-verified legacy success while refreshing a different transaction', async () => {
    const { deps, visible } = setup([pending], [old, pending]);
    await refreshMainnetTransferRecords(old.senderAddress, deps);
    deps.inspect.mockClear();
    await refreshMainnetTransferRecords(old.senderAddress, deps, pending.transactionHash);
    expect(visible().find(r => r.transactionHash === old.transactionHash)?.receiptState).toBe('confirmed');
    expect(deps.inspect).toHaveBeenCalledTimes(1);
    expect(deps.inspect.mock.calls[0][0].transactionHash).toBe(pending.transactionHash);
  });
  it('never shows cached success if the exact legacy receipt read fails' , async () => {
    const { deps, visible } = setup([], [old]);
    deps.inspect.mockRejectedValue(new Error('receipt unavailable'));
    await refreshMainnetTransferRecords(old.senderAddress, deps);
    expect(visible()[0].receiptState).toBe('status-unavailable');
  });
  it('does not re-query a confirmed native nonce-5 record while checking nonce 6', async () => {
    const confirmed = { ...old, nonce: 5, assetId: 'native-bnb' as const };
    const { deps, visible } = setup([confirmed, pending], [confirmed, pending]);
    await refreshMainnetTransferRecords(old.senderAddress, deps);
    expect(deps.inspect).toHaveBeenCalledTimes(1);
    expect(deps.inspect.mock.calls[0][0].transactionHash).toBe(pending.transactionHash);
    expect(visible().find(r => r.nonce === 5)?.receiptState).toBe('confirmed');
  });
  it('a row-specific Check status reads only the chosen hash', async () => {
    const { deps } = setup([pending], [old, pending]);
    await refreshMainnetTransferRecords(old.senderAddress, deps, pending.transactionHash);
    expect(deps.inspect).toHaveBeenCalledTimes(1);
    expect(deps.inspect.mock.calls[0][0].transactionHash).toBe(pending.transactionHash);
  });
  it('retains atomic native winner/loser settlement rather than an earlier pending display', async () => {
    const replacement = { ...pending, transactionHash: `0x${'c'.repeat(64)}` as const, replacesTransactionHash: pending.transactionHash, replacementKind: 'cancel' as const, recipientAddress: pending.senderAddress, amountWei: '0' };
    const { deps, visible } = setup([pending, replacement], []);
    deps.loadNative.mockResolvedValueOnce([pending, replacement]).mockResolvedValueOnce([{...pending, receiptState: 'cancelled', cancelledByHash: replacement.transactionHash}, {...replacement, receiptState: 'confirmed'}]);
    await refreshMainnetTransferRecords(old.senderAddress, deps);
    expect(visible().find(r => r.transactionHash === pending.transactionHash)?.receiptState).toBe('cancelled');
    expect(visible().find(r => r.transactionHash === replacement.transactionHash)?.receiptState).toBe('confirmed');
  });
  it('does not publish results after the screen/address generation changes', async () => {
    const { deps } = setup([pending], []);
    deps.current = () => false;
    await refreshMainnetTransferRecords(old.senderAddress, deps);
    expect(deps.publish).not.toHaveBeenCalled();
    expect(deps.inspect).not.toHaveBeenCalled();
  });
});
