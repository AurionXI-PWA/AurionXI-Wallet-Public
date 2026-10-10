import { describe, expect, it, vi } from 'vitest';
import { TransactionReceiptNotFoundError } from 'viem';

import { pollTestnetTransactionReceipt } from './testnet-receipt-poller';

const hash = `0x${'a'.repeat(64)}` as const;

describe('Testnet receipt poller', () => {
  it('normalizes confirmed and reverted public receipts', async () => {
    await expect(pollTestnetTransactionReceipt({ getTransactionReceipt: vi.fn().mockResolvedValue({ status: 'success', blockNumber: 123n }) }, hash)).resolves.toEqual({ state: 'confirmed', blockNumber: '123' });
    await expect(pollTestnetTransactionReceipt({ getTransactionReceipt: vi.fn().mockResolvedValue({ status: 'reverted', blockNumber: 124n }) }, hash)).resolves.toEqual({ state: 'reverted', blockNumber: '124' });
  });

  it('keeps an absent receipt pending and separates provider failure', async () => {
    await expect(pollTestnetTransactionReceipt({ getTransactionReceipt: vi.fn().mockRejectedValue(new TransactionReceiptNotFoundError({ hash })) }, hash)).resolves.toEqual({ state: 'pending' });
    await expect(pollTestnetTransactionReceipt({ getTransactionReceipt: vi.fn().mockRejectedValue(new Error('timeout')) }, hash)).resolves.toEqual({ state: 'unavailable' });
  });
});
