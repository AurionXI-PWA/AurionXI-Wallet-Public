import { describe, expect, it } from 'vitest';

import { validateTestnetTransactionIntent } from './transaction-intent-policy';

const base = {
  chainId: 97,
  chainIsTestnet: true,
  signingEnabled: true,
  assetId: 'arxi' as const,
  recipient: '0x1111111111111111111111111111111111111111',
  amount: '12.5',
};

describe('testnet transaction intent policy', () => {
  it('accepts a reviewed ARXI testnet intent without signing or broadcasting it', () => {
    expect(validateTestnetTransactionIntent(base)).toMatchObject({
      ok: true,
      intent: {
        chainId: 97,
        recipient: base.recipient,
        amount: 12_500_000_000_000_000_000n,
        asset: { id: 'arxi', symbol: 'ARXI' },
      },
    });
  });

  it('hard-blocks mainnet and disabled signing', () => {
    expect(validateTestnetTransactionIntent({ ...base, chainId: 56, chainIsTestnet: false })).toEqual({
      ok: false, reason: 'mainnet-blocked',
    });
    expect(validateTestnetTransactionIntent({ ...base, signingEnabled: false })).toEqual({
      ok: false, reason: 'signing-disabled',
    });
  });

  it('rejects an unallowlisted asset, recipient, and unsafe amount', () => {
    expect(validateTestnetTransactionIntent({ ...base, assetId: 'unknown' as never })).toEqual({
      ok: false, reason: 'asset-not-allowlisted',
    });
    expect(validateTestnetTransactionIntent({ ...base, recipient: 'not-an-address' })).toEqual({
      ok: false, reason: 'invalid-recipient',
    });
    expect(validateTestnetTransactionIntent({ ...base, amount: '0.0000000000000000001' })).toEqual({
      ok: false, reason: 'invalid-amount',
    });
  });
});
