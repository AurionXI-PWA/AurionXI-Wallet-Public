import { describe, expect, it } from 'vitest';
import { canCheckMainnetRecoveryReceipt, parseMainnetRecoveryDiagnostics } from './mainnet-native-recovery-diagnostics';

const sender = '0x1111111111111111111111111111111111111111';
const hash = `0x${'a'.repeat(64)}`;
const fixture = () => ({ chainId: 56, senderAddress: sender, reviewedNonce: '1', livePendingNonce: '1', recordCount: 1,
  reason: 'submitted_receipt_required', records: [{ nonce: '0', state: 'SUBMITTED', transactionHash: hash }] });

describe('public native recovery diagnostics', () => {
  it.each(['SIGNED_UNVERIFIED', 'SIGNED', 'SUBMITTED'] as const)('allows exact-hash receipt inspection for %s without changing its state', (state) => {
    const input = { ...fixture(), reason: 'nonce_mismatch', records: [{ nonce: '0', state, transactionHash: hash }] };
    const result = parseMainnetRecoveryDiagnostics(input, sender, 1);
    expect(canCheckMainnetRecoveryReceipt(result.records[0])).toBe(true);
    expect(result.records[0].state).toBe(state);
    expect(result.records[0].nonce).toBe('0');
    expect(result.reviewedNonce).toBe('1');
  });

  it('never offers receipt recovery for unsigned or invalid-hash records', () => {
    for (const state of ['RESERVED', 'SIGNING'] as const) {
      expect(canCheckMainnetRecoveryReceipt({ nonce: '0', state, transactionHash: null })).toBe(false);
      expect(canCheckMainnetRecoveryReceipt({ nonce: '0', state, transactionHash: hash as `0x${string}` })).toBe(false);
    }
    expect(canCheckMainnetRecoveryReceipt({ nonce: '0', state: 'SIGNED', transactionHash: '0x123' })).toBe(false);
  });

  it('keeps an old submitted hash discoverable without a JS submission record', () => {
    const result = parseMainnetRecoveryDiagnostics(fixture(), sender, 1);
    expect(result.records).toEqual([{ nonce: '0', state: 'SUBMITTED', transactionHash: hash }]);
    expect(result.livePendingNonce).toBe('1');
    expect(Object.isFrozen(result.records)).toBe(true);
  });

  it('rejects other sender, chain, reviewed nonce and malformed live nonce', () => {
    for (const change of [{ senderAddress: `0x${'2'.repeat(40)}` }, { chainId: 97 }, { reviewedNonce: '0' }, { livePendingNonce: '-1' }]) {
      expect(() => parseMainnetRecoveryDiagnostics({ ...fixture(), ...change }, sender, 1)).toThrow();
    }
  });

  it('rejects missing or invalid hashes for records which may have been submitted', () => {
    for (const transactionHash of [null, '0x123', 'untrusted']) {
      expect(() => parseMainnetRecoveryDiagnostics({ ...fixture(), records: [{ nonce: '0', state: 'SUBMITTED', transactionHash }] }, sender, 1)).toThrow();
    }
  });

  it('retains multiple replacement hashes at the same nonce, while rejecting duplicate hashes', () => {
    const records = [fixture().records[0], { ...fixture().records[0], transactionHash: `0x${'b'.repeat(64)}`, replacesTransactionHash: hash }, { ...fixture().records[0], transactionHash: `0x${'c'.repeat(64)}`, replacesTransactionHash: hash }, { nonce: '0', state: 'SIGNING', transactionHash: null, replacesTransactionHash: hash }];
    expect(parseMainnetRecoveryDiagnostics({ ...fixture(), records, recordCount: 4, reason: 'multiple_records' }, sender, 1).records).toHaveLength(4);
  });
  it('rejects inconsistent counts and duplicate journal keys', () => {
    expect(() => parseMainnetRecoveryDiagnostics({ ...fixture(), recordCount: 2 }, sender, 1)).toThrow();
    const input = fixture();
    expect(() => parseMainnetRecoveryDiagnostics({ ...input, recordCount: 2, records: [...input.records, ...input.records] }, sender, 1)).toThrow();
  });

  it('whitelists output rather than forwarding unexpected native fields', () => {
    const input = fixture();
    const result = parseMainnetRecoveryDiagnostics({ ...input, authorizationId: 'omit-me', broadcastHandle: 'omit-me',
      records: [{ ...input.records[0], reviewDigest: 'omit-me' }] }, sender, 1);
    expect(JSON.stringify(result)).not.toContain('omit-me');
  });

  it('preserves unavailable live nonce without reporting a clear journal', () => {
    const result = parseMainnetRecoveryDiagnostics({ ...fixture(), livePendingNonce: null, reason: 'snapshot_unavailable' }, sender, 1);
    expect(result.reason).toBe('snapshot_unavailable');
    expect(result.records).toHaveLength(1);
  });
});
