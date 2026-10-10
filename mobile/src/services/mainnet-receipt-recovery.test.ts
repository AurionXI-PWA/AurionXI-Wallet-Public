import { describe, expect, it, vi } from 'vitest';

import { createSubmittedMainnetRecord } from '@/storage/mainnet-submission-journal';
import { persistThenReadMainnetReceipt, refreshPersistedMainnetReceipt } from './mainnet-receipt-recovery';

const record = createSubmittedMainnetRecord({ transactionHash: `0x${'ab'.repeat(32)}`, senderAddress: '0x1111111111111111111111111111111111111111', recipientAddress: '0x2222222222222222222222222222222222222222', assetId: 'native-bnb', amountWei: '1', nonce: 3, submittedAt: 100 });

describe('Mainnet receipt recovery', () => {
  it('persists the accepted hash before its first receipt read', async () => {
    const order: string[] = [];
    const persist = vi.fn(async (next) => { order.push(`persist:${next.receiptState}`); });
    const reader = { read: vi.fn(async () => { order.push('read'); return { transactionKnown: true }; }) };
    const result = await persistThenReadMainnetReceipt({ record, reader, now: 200, persist });
    expect(order).toEqual(['persist:submitted', 'read', 'persist:pending']);
    expect(result.receiptState).toBe('pending');
  });

  it('maps confirmed and reverted receipts without any resubmission callback', async () => {
    const persist = vi.fn().mockResolvedValue(undefined);
    const confirmed = await refreshPersistedMainnetReceipt({ record, now: 200, persist, reconcileNative: async () => 'confirmed', reader: { read: async () => ({ receipt: { status: 'success', blockNumber: 50n } }) } });
    const reverted = await refreshPersistedMainnetReceipt({ record, now: 201, persist, reconcileNative: async () => 'reverted', reader: { read: async () => ({ receipt: { status: 'reverted', blockNumber: 51n } }) } });
    expect(confirmed).toMatchObject({ receiptState: 'confirmed', blockNumber: '50' });
    expect(reverted).toMatchObject({ receiptState: 'reverted', blockNumber: '51' });
  });

  it('distinguishes unavailable status from nonce-proven replacement/drop', async () => {
    const persist = vi.fn().mockResolvedValue(undefined);
    const unavailable = await refreshPersistedMainnetReceipt({ record, now: 200, persist, reader: { read: async () => { throw new Error('offline'); } } });
    const replaced = await refreshPersistedMainnetReceipt({ record, now: 201, persist, reader: { read: async () => ({ transactionKnown: false, latestConfirmedNonce: 4 }) } });
    const pending = await refreshPersistedMainnetReceipt({ record, now: 202, persist, reader: { read: async () => ({ transactionKnown: false, latestConfirmedNonce: 3 }) } });
    expect(unavailable.receiptState).toBe('status-unavailable');
    expect(replaced.receiptState).toBe('replaced-or-dropped');
    expect(pending.receiptState).toBe('pending');
  });
});
