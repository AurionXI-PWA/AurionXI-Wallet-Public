export const MAINNET_DIRECT_PRODUCTION_POLICY = Object.freeze({
  policyVersion: 1,
  chainId: 56,
  releaseApproved: true,
  supportedAssets: ['native-bnb', 'arxi', 'usdt'] as const,
  maxGasLimit: 500_000n,
  maxGasPriceWei: 1_000_000_000_000n,
  maxNativeBnbAmountWei: 100_000_000_000_000_000n,
  maxArxiAmountWei: 5_000_000_000_000_000_000_000n,
  maxUsdtAmountWei: 100_000_000_000_000_000_000n,
  maxFeeWei: 100_000_000_000_000n,
  rollingWindowMs: 86_400_000,
  maxTransactionsPerWindow: 5,
  maxNativeBnbPerWindowWei: 100_000_000_000_000_000n,
  maxArxiPerWindowWei: 10_000_000_000_000_000_000_000n,
  maxUsdtPerWindowWei: 500_000_000_000_000_000_000n,
});

export type MainnetSendAssetId = 'native-bnb' | 'arxi' | 'usdt';

export function isMainnetSendAssetId(value: unknown): value is MainnetSendAssetId {
  return value === 'native-bnb' || value === 'arxi' || value === 'usdt';
}

export function getMainnetSendAmountCap(assetId: MainnetSendAssetId): bigint {
  switch (assetId) {
    case 'native-bnb': return MAINNET_DIRECT_PRODUCTION_POLICY.maxNativeBnbAmountWei;
    case 'arxi': return MAINNET_DIRECT_PRODUCTION_POLICY.maxArxiAmountWei;
    case 'usdt': return MAINNET_DIRECT_PRODUCTION_POLICY.maxUsdtAmountWei;
    default: throw new Error('Unsupported Mainnet asset.');
  }
}

export type MainnetDirectProductionPolicyDecision = Readonly<
  { ok: true } | {
    ok: false;
    reason: 'mainnet-production-policy-not-approved' | 'mainnet-production-limits-not-approved';
  }
>;

/** Source-controlled approval. Native and relay enforcement remain independent mandatory gates. */
export function evaluateMainnetDirectProductionPolicy(): MainnetDirectProductionPolicyDecision {
  if (!MAINNET_DIRECT_PRODUCTION_POLICY.releaseApproved) return { ok: false, reason: 'mainnet-production-policy-not-approved' };
  const limitsApproved = MAINNET_DIRECT_PRODUCTION_POLICY.maxNativeBnbAmountWei > 0n
    && MAINNET_DIRECT_PRODUCTION_POLICY.maxArxiAmountWei > 0n
    && MAINNET_DIRECT_PRODUCTION_POLICY.maxFeeWei > 0n;
  return limitsApproved ? { ok: true } : { ok: false, reason: 'mainnet-production-limits-not-approved' };
}
