import { describe, expect, it } from 'vitest';
import { validateMainnetTransactionReview } from './mainnet-transaction-intent-policy';
const recipient = '0x2222222222222222222222222222222222222222';
describe('exact Mainnet transfer precision', () => {
  it.each(['native-bnb', 'arxi', 'usdt'] as const)('rejects excess precision instead of rounding %s', (assetId) => {
    expect(validateMainnetTransactionReview({ assetId, recipient, amount: '1.0000000000000000001' })).toEqual({ ok: false, reason: 'invalid-amount' });
    const valid = validateMainnetTransactionReview({ assetId, recipient, amount: '1.000000000000000001' });
    expect(valid.ok).toBe(true);
    if (valid.ok) expect(valid.intent.amount).toBe(1_000_000_000_000_000_001n);
  });
});
