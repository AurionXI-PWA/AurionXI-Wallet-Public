import { describe, expect, it } from 'vitest';

import { prepareTestnetSendController } from './testnet-send-controller';

const base = {
  review: {
    chainId: 97,
    chainIsTestnet: true,
    signingEnabled: true,
    assetId: 'arxi' as const,
    recipient: '0x1111111111111111111111111111111111111111',
    amount: '0.01',
  },
  vaultUnlocked: true,
  walletSecretsEnabled: true,
  reviewConfirmed: true,
  nativeBalanceWei: 1_000_000_000_000_000_000n,
  gasPriceWei: 1_000_000_000n,
  pinVerifiedAt: 100,
  rpcConfigured: true,
  now: 101,
};

describe('Testnet send controller', () => {
  it('prepares an in-memory Testnet request without signing or broadcast', () => {
    const result = prepareTestnetSendController(base);
    expect(result).toMatchObject({ ok: true, intent: { chainId: 97 }, transfer: { chainId: 97 } });
  });

  it('reports the earliest failed safety stage', () => {
    expect(prepareTestnetSendController({ ...base, review: { ...base.review, signingEnabled: false } })).toEqual({ ok: false, stage: 'review', reason: 'signing-disabled' });
    expect(prepareTestnetSendController({ ...base, nativeBalanceWei: 0n })).toEqual({ ok: false, stage: 'fee', reason: 'insufficient-native-balance' });
    expect(prepareTestnetSendController({ ...base, pinVerifiedAt: 0, now: 100_000 })).toEqual({ ok: false, stage: 'pin', reason: 'pin-confirmation-expired' });
    expect(prepareTestnetSendController({ ...base, rpcConfigured: false })).toEqual({ ok: false, stage: 'preflight', reason: 'rpc-unavailable' });
  });
});
