import { describe, expect, it } from 'vitest';
import { getMainnetSendAmountCap, isMainnetSendAssetId } from './mainnet-direct-production-policy';
import { prepareMainnetExecution } from './mainnet-execution-coordinator';
import { getMainnetBoundReviewFingerprint } from './mainnet-review-envelope';
import { validateMainnetTransactionReview } from './mainnet-transaction-intent-policy';

const sender = '0x1111111111111111111111111111111111111111';
const recipient = '0x2222222222222222222222222222222222222222';
const usdtContract = '0x55d398326f99059ff775485246999027b3197955';
const snapshot = { chainId: 56 as const, nonce: 2n, gasPriceWei: 50_000_000n,
  nativeBalanceWei: 1_000_000_000_000_000n, assetBalanceWei: 2_000_000_000_000_000_000n, observedAt: 1000 };
const prepare = (overrides: Partial<typeof snapshot> = {}) => prepareMainnetExecution({
  senderAddress: sender, transaction: { assetId: 'usdt', recipient, amount: '1.000000000000000001' },
  snapshot: { ...snapshot, ...overrides },
});

describe('BSC USDT Send and Receive policy', () => {
  it('pins USDT to chain 56, 18 decimals and its fixed BSC contract', () => {
    const valid = validateMainnetTransactionReview({ assetId: 'usdt', recipient, amount: '1' });
    expect(valid.ok).toBe(true);
    if (!valid.ok) throw new Error('Expected a USDT review.');
    expect(valid.intent.asset.address?.toLowerCase()).toBe(usdtContract);
    expect(valid.intent.asset.decimals).toBe(18);
    expect(valid.intent.chainId).toBe(56);
    expect(valid.intent.amount).toBe(1_000_000_000_000_000_000n);
  });
  it('review requires USDT balance and BNB for fee, not USDT for fee', () => {
    expect(prepare().state).toBe('review-ready');
    expect(prepare({ assetBalanceWei: 1_000_000_000_000_000_000n }).state).toBe('insufficient-asset-balance');
    expect(prepare({ nativeBalanceWei: 0n }).state).toBe('insufficient-native-balance');
    const missing = prepareMainnetExecution({
      senderAddress: sender, transaction: { assetId: 'usdt', recipient, amount: '1' },
      snapshot: { chainId: 56, nonce: 2n, gasPriceWei: snapshot.gasPriceWei, nativeBalanceWei: snapshot.nativeBalanceWei, observedAt: 1000 },
    });
    expect(missing.state).toBe('fee-unavailable');
  });
  it('creates an exact USDT review without BNB value confusion and binds its asset and contract', () => {
    const prepared = prepare();
    if (prepared.state !== 'review-ready') throw new Error('Expected a ready review.');
    expect(prepared.review).toMatchObject({ assetId: 'usdt', amount: 1_000_000_000_000_000_001n, gas: 160_000n, nonce: 2 });
    expect(prepared.review.assetContract?.toLowerCase()).toBe(usdtContract);
    expect(prepared.fee.feeLabel).toBe('0.000008 BNB');
    const fingerprint = getMainnetBoundReviewFingerprint(prepared.review);
    expect(getMainnetBoundReviewFingerprint({ ...prepared.review, assetId: 'arxi' })).not.toBe(fingerprint);
    expect(getMainnetBoundReviewFingerprint({ ...prepared.review, assetContract: recipient })).not.toBe(fingerprint);
  });
  it('allows only the three Send assets and keeps unsupported assets out of amount-cap selection', () => {
    for (const asset of ['native-bnb', 'arxi', 'usdt']) expect(isMainnetSendAssetId(asset)).toBe(true);
    for (const asset of ['usdc', 'eth', 'btcb', 'USDT', undefined]) expect(isMainnetSendAssetId(asset)).toBe(false);
    expect(getMainnetSendAmountCap('usdt')).toBe(100_000_000_000_000_000_000n);
    expect(getMainnetSendAmountCap('native-bnb')).toBe(100_000_000_000_000_000n);
    expect(getMainnetSendAmountCap('arxi')).toBe(5_000_000_000_000_000_000_000n);
  });
});
