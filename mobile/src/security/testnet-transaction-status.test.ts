import { describe, expect, it } from 'vitest';

import { canRetryTestnetTransaction, INITIAL_TESTNET_TRANSACTION_STATUS, presentTestnetTransactionStatus, transitionTestnetTransactionStatus } from './testnet-transaction-status';

const hash = `0x${'a'.repeat(64)}` as const;

describe('Testnet transaction status', () => {
  it('tracks signed, submitted, pending, and confirmed states without a network dependency', () => {
    const signed = transitionTestnetTransactionStatus(INITIAL_TESTNET_TRANSACTION_STATUS, { type: 'SIGNED', hash, now: 1 });
    const submitted = transitionTestnetTransactionStatus(signed, { type: 'SUBMITTED', hash, now: 2 });
    const pending = transitionTestnetTransactionStatus(submitted, { type: 'PENDING', now: 3 });
    const confirmed = transitionTestnetTransactionStatus(pending, { type: 'CONFIRMED', blockNumber: '123', now: 4 });
    expect(confirmed).toEqual({ stage: 'confirmed', hash, blockNumber: '123', confirmedAt: 4 });
  });

  it('only permits a retry when the failure explicitly allows it', () => {
    const signed = transitionTestnetTransactionStatus(INITIAL_TESTNET_TRANSACTION_STATUS, { type: 'SIGNED', hash, now: 1 });
    const retryable = transitionTestnetTransactionStatus(signed, { type: 'FAILED', reason: 'status-unavailable', retryAllowed: true });
    expect(canRetryTestnetTransaction(retryable)).toBe(true);
    const reverted = transitionTestnetTransactionStatus(signed, { type: 'FAILED', reason: 'receipt-reverted', retryAllowed: false });
    expect(canRetryTestnetTransaction(reverted)).toBe(false);
  });

  it('accepts a later public confirmation after a receipt-status outage', () => {
    const signed = transitionTestnetTransactionStatus(INITIAL_TESTNET_TRANSACTION_STATUS, { type: 'SIGNED', hash, now: 1 });
    const unavailable = transitionTestnetTransactionStatus(signed, { type: 'FAILED', reason: 'status-unavailable', retryAllowed: true });
    expect(transitionTestnetTransactionStatus(unavailable, { type: 'CONFIRMED', blockNumber: '456', now: 5 })).toEqual({
      stage: 'confirmed', hash, blockNumber: '456', confirmedAt: 5,
    });
  });

  it('keeps a submitted hash refreshable after its first receipt lookup is unavailable', () => {
    const signed = transitionTestnetTransactionStatus(INITIAL_TESTNET_TRANSACTION_STATUS, { type: 'SIGNED', hash, now: 1 });
    const submitted = transitionTestnetTransactionStatus(signed, { type: 'SUBMITTED', hash, now: 2 });
    const unavailable = transitionTestnetTransactionStatus(submitted, { type: 'FAILED', reason: 'status-unavailable', retryAllowed: true });
    expect(canRetryTestnetTransaction(unavailable)).toBe(true);
    expect(presentTestnetTransactionStatus(unavailable).detail).toContain('do not submit the same transfer again');
  });

  it('does not transition from idle without a submitted hash', () => {
    expect(transitionTestnetTransactionStatus(INITIAL_TESTNET_TRANSACTION_STATUS, { type: 'PENDING', now: 1 })).toEqual(INITIAL_TESTNET_TRANSACTION_STATUS);
    const signed = transitionTestnetTransactionStatus(INITIAL_TESTNET_TRANSACTION_STATUS, { type: 'SIGNED', hash, now: 1 });
    expect(transitionTestnetTransactionStatus(signed, { type: 'SUBMITTED', hash: `0x${'b'.repeat(64)}`, now: 2 })).toEqual(signed);
  });

  it('presents the idle state without implying that signing is enabled', () => {
    expect(presentTestnetTransactionStatus(INITIAL_TESTNET_TRANSACTION_STATUS)).toMatchObject({
      title: 'Ready for secure confirmation',
      tone: 'neutral',
    });
  });

  it('distinguishes an on-chain revert from a temporary receipt outage', () => {
    const signed = transitionTestnetTransactionStatus(INITIAL_TESTNET_TRANSACTION_STATUS, { type: 'SIGNED', hash, now: 1 });
    const reverted = transitionTestnetTransactionStatus(signed, { type: 'FAILED', reason: 'receipt-reverted', retryAllowed: false });
    expect(presentTestnetTransactionStatus(reverted)).toMatchObject({
      title: 'Transaction reverted on-chain',
      detail: expect.stringContaining('No asset transfer was completed'),
    });
    const unavailable = transitionTestnetTransactionStatus(signed, { type: 'FAILED', reason: 'status-unavailable', retryAllowed: true });
    expect(presentTestnetTransactionStatus(unavailable)).toMatchObject({
      title: 'Confirmation status temporarily unavailable',
      detail: expect.stringContaining('do not submit the same transfer again'),
    });
  });
});
