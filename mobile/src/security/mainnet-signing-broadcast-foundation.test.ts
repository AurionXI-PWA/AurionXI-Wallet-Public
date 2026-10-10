import { describe, expect, it } from 'vitest';

import { evaluateMainnetBroadcastState, resolveMainnetReceipt } from './mainnet-broadcast-receipt-coordinator';
import { prepareUnsignedMainnetTransaction, requestLocalMainnetSignature } from './mainnet-local-signing-adapter';
import type { MainnetReviewEnvelope } from './mainnet-review-envelope';

const arxiReview: MainnetReviewEnvelope = {
  chainId: 56,
  senderAddress: '0x1111111111111111111111111111111111111111',
  assetId: 'arxi',
  assetContract: '0x6fFEC4860325f8bfB3F000354708A7d0caE4b250',
  recipient: '0xEf7c8E41ba2707c2E92b8837Ff4B5EB55cec27e6',
  amount: 10n,
  nonce: 5,
  gas: 160_000n,
  gasPrice: 1_000_000_000n,
  observedAt: 1,
};

describe('Mainnet signing and broadcast foundation', () => {
  it('prepares deterministic unsigned BNB/ARXI data without signing material', () => {
    const prepared = prepareUnsignedMainnetTransaction(arxiReview);
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    expect(prepared.transaction.data).toMatch(/^0xa9059cbb/);
    expect(requestLocalMainnetSignature(prepared.transaction)).toMatchObject({ ok: false, reason: 'mainnet-signing-not-released' });
  });

  it('hard-blocks broadcast regardless of caller-controlled release or duplicate state', () => {
    const prepared = prepareUnsignedMainnetTransaction(arxiReview);
    if (!prepared.ok) throw new Error('fixture failure');
    expect(evaluateMainnetBroadcastState({ transaction: prepared.transaction })).toMatchObject({ state: 'release-blocked', reason: 'mainnet-signing-not-released' });
  });

  it('maps public receipt observations to pending, confirmed, reverted, or dropped states', () => {
    const transactionHash = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as const;
    expect(resolveMainnetReceipt({ transactionHash, submittedAt: 1, now: 2 })).toMatchObject({ state: 'pending' });
    expect(resolveMainnetReceipt({ transactionHash, submittedAt: 1, now: 2, receipt: { status: 'success', blockNumber: 10n } })).toMatchObject({ state: 'confirmed' });
    expect(resolveMainnetReceipt({ transactionHash, submittedAt: 1, now: 2, receipt: { status: 'reverted', blockNumber: 10n } })).toMatchObject({ state: 'reverted' });
    expect(resolveMainnetReceipt({ transactionHash, submittedAt: 1, now: 2, transactionKnown: false, transactionNonce: 5, latestConfirmedNonce: 6 })).toMatchObject({ state: 'replaced-or-dropped' });
    expect(resolveMainnetReceipt({ transactionHash, submittedAt: 1, now: 2, statusUnavailable: true })).toMatchObject({ state: 'status-unavailable' });
  });
});
