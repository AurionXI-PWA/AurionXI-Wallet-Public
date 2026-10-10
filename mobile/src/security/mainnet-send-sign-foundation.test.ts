import { describe, expect, it } from 'vitest';

import { evaluateMainnetFeeReadiness } from './mainnet-fee-readiness';
import { createMainnetReviewEnvelope } from './mainnet-review-envelope';
import { validateMainnetTransactionReview } from './mainnet-transaction-intent-policy';

const recipient = '0xEf7c8E41ba2707c2E92b8837Ff4B5EB55cec27e6';

describe('Mainnet send and sign foundation', () => {
  it('creates review-only data for configured Mainnet assets without enabling signing', () => {
    const review = validateMainnetTransactionReview({ assetId: 'arxi', recipient, amount: '1.25' });
    expect(review.ok).toBe(true);
    if (!review.ok) return;
    const fee = evaluateMainnetFeeReadiness({ intent: review.intent, nativeBalanceWei: 10n ** 18n, gasPriceWei: 1_000_000_000n, assetBalanceWei: 2n * 10n ** 18n });
    expect(fee.state).toBe('ready');
    if (fee.state !== 'ready') return;
    expect(createMainnetReviewEnvelope({ senderAddress: '0x1111111111111111111111111111111111111111', intent: review.intent, fee, snapshot: { chainId: 56, nonce: 9n, gasPriceWei: 1_000_000_000n, observedAt: 1_700_000_000_000 } })).toMatchObject({ chainId: 56, assetId: 'arxi', nonce: 9 });
  });

  it('keeps unknown Mainnet tokens out of the future review flow', () => {
    expect(validateMainnetTransactionReview({ assetId: 'unconfigured-token' as never, recipient, amount: '1' })).toEqual({ ok: false, reason: 'asset-not-configured' });
  });
});
