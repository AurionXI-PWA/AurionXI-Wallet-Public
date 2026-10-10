import type { Hash } from 'viem';

export type TestnetTransactionStatus =
  | { stage: 'idle' }
  | { stage: 'signed'; hash: Hash; signedAt: number }
  | { stage: 'submitted'; hash: Hash; submittedAt: number }
  | { stage: 'pending'; hash: Hash; submittedAt: number; checkedAt: number }
  | { stage: 'confirmed'; hash: Hash; blockNumber: string; confirmedAt: number }
  | { stage: 'failed'; hash?: Hash; reason: 'broadcast-rejected' | 'receipt-reverted' | 'status-unavailable'; retryAllowed: boolean };

export type TestnetTransactionStatusEvent =
  | { type: 'SIGNED'; hash: Hash; now: number }
  | { type: 'SUBMITTED'; hash: Hash; now: number }
  | { type: 'PENDING'; now: number }
  | { type: 'CONFIRMED'; blockNumber: string; now: number }
  | { type: 'FAILED'; reason: Extract<TestnetTransactionStatus, { stage: 'failed' }>['reason']; retryAllowed: boolean }
  | { type: 'RESET' };

export const INITIAL_TESTNET_TRANSACTION_STATUS: TestnetTransactionStatus = { stage: 'idle' };

/** Pure UI state machine only; receipt reading and transaction submission stay outside this module. */
export function transitionTestnetTransactionStatus(
  state: TestnetTransactionStatus,
  event: TestnetTransactionStatusEvent,
): TestnetTransactionStatus {
  if (event.type === 'RESET') return INITIAL_TESTNET_TRANSACTION_STATUS;
  if (state.stage === 'idle') {
    return event.type === 'SIGNED'
      ? { stage: 'signed', hash: event.hash, signedAt: event.now }
      : state;
  }
  if (state.stage === 'signed') {
    if (event.type === 'SUBMITTED' && event.hash === state.hash) {
      return { stage: 'submitted', hash: state.hash, submittedAt: event.now };
    }
    if (event.type === 'FAILED') return { stage: 'failed', hash: state.hash, reason: event.reason, retryAllowed: event.retryAllowed };
    return state;
  }
  if (state.stage === 'submitted') {
    if (event.type === 'PENDING') return { stage: 'pending', hash: state.hash, submittedAt: state.submittedAt, checkedAt: event.now };
    if (event.type === 'CONFIRMED') return { stage: 'confirmed', hash: state.hash, blockNumber: event.blockNumber, confirmedAt: event.now };
    if (event.type === 'FAILED') return { stage: 'failed', hash: state.hash, reason: event.reason, retryAllowed: event.retryAllowed };
    return state;
  }
  if (state.stage === 'pending') {
    if (event.type === 'PENDING') return { ...state, checkedAt: event.now };
    if (event.type === 'CONFIRMED') return { stage: 'confirmed', hash: state.hash, blockNumber: event.blockNumber, confirmedAt: event.now };
    if (event.type === 'FAILED') return { stage: 'failed', hash: state.hash, reason: event.reason, retryAllowed: event.retryAllowed };
    return state;
  }
  if (state.stage === 'failed' && state.hash && state.reason === 'status-unavailable') {
    if (event.type === 'PENDING') {
      return { stage: 'pending', hash: state.hash, submittedAt: 0, checkedAt: event.now };
    }
    if (event.type === 'CONFIRMED') {
      return { stage: 'confirmed', hash: state.hash, blockNumber: event.blockNumber, confirmedAt: event.now };
    }
    if (event.type === 'FAILED') {
      return { ...state, reason: event.reason, retryAllowed: event.retryAllowed };
    }
  }
  return state;
}

export function canRetryTestnetTransaction(status: TestnetTransactionStatus): boolean {
  return status.stage === 'failed' && status.retryAllowed;
}

export type TestnetTransactionStatusPresentation = {
  title: string;
  detail: string;
  tone: 'neutral' | 'pending' | 'success' | 'warning';
};

/** User-facing copy only. It deliberately does not inspect the network or persist receipt data. */
export function presentTestnetTransactionStatus(
  status: TestnetTransactionStatus,
): TestnetTransactionStatusPresentation {
  switch (status.stage) {
    case 'idle':
      return {
        title: 'Ready for secure confirmation',
        detail: 'A transfer status appears here after a local signature and separate broadcast confirmation.',
        tone: 'neutral',
      };
    case 'signed':
      return { title: 'Signed locally — broadcast pending', detail: 'This signature is local only. Broadcast requires a separate confirmation.', tone: 'pending' };
    case 'submitted':
      return { title: 'Transaction submitted', detail: 'The network received this transaction. Its receipt is being checked.', tone: 'pending' };
    case 'pending':
      return { title: 'Waiting for confirmation', detail: 'The transaction is pending on the selected network. You may refresh its status.', tone: 'pending' };
    case 'confirmed':
      return { title: 'Confirmed on BNB Smart Chain', detail: `Included in block #${status.blockNumber}.`, tone: 'success' };
    case 'failed':
      if (status.reason === 'receipt-reverted') {
        return {
          title: 'Transaction reverted on-chain',
          detail: 'No asset transfer was completed. A network fee may have been used. Review the transaction on BscScan before creating a new transfer.',
          tone: 'warning',
        };
      }
      if (status.reason === 'status-unavailable') {
        return {
          title: 'Confirmation status temporarily unavailable',
          detail: 'The transaction was submitted, but its public receipt could not be read yet. Refresh status or view BscScan; do not submit the same transfer again.',
          tone: 'warning',
        };
      }
      return {
        title: 'Broadcast was not accepted',
        detail: status.retryAllowed ? 'No transfer was confirmed. You may safely review the transfer again.' : 'No transfer was submitted. Review the transaction details before trying again.',
        tone: 'warning',
      };
  }
}
