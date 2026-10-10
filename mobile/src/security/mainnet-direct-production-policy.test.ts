import { describe, expect, it } from 'vitest';

import { evaluateMainnetDirectProductionPolicy, MAINNET_DIRECT_PRODUCTION_POLICY } from './mainnet-direct-production-policy';

describe('Direct Mainnet production policy', () => {
  it('is source-controlled, owner-approved, asset-scoped, and capped', () => {
    expect(MAINNET_DIRECT_PRODUCTION_POLICY).toMatchObject({
      policyVersion: 1, chainId: 56, releaseApproved: true,
      supportedAssets: ['native-bnb', 'arxi', 'usdt'],
      maxUsdtAmountWei: 100_000_000_000_000_000_000n,
      maxUsdtPerWindowWei: 500_000_000_000_000_000_000n,
      maxNativeBnbAmountWei: 100_000_000_000_000_000n,
      maxArxiAmountWei: 5_000_000_000_000_000_000_000n,
      maxFeeWei: 100_000_000_000_000n,
      maxTransactionsPerWindow: 5,
      maxNativeBnbPerWindowWei: 100_000_000_000_000_000n,
      maxArxiPerWindowWei: 10_000_000_000_000_000_000_000n,
    });
    expect(evaluateMainnetDirectProductionPolicy()).toEqual({ ok: true });
  });
});
