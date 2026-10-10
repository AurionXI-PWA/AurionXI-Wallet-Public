import { describe, expect, it } from 'vitest';

import { createTestnetSigningEnvelope } from './testnet-signing-envelope';

const transfer = { chainId: 97 as const, to: '0x1111111111111111111111111111111111111111' as const, data: '0x' as const, value: 1n };
const snapshot = { chainId: 97 as const, nativeBalanceWei: 1_000_000_000_000_000n, assetBalanceWei: 1_000_000_000_000_000n, nonce: 4n, gasPriceWei: 1_000_000_000n };
const fee = { state: 'ready' as const, gasLimit: 21_000n, gasPriceWei: 1_000_000_000n, feeWei: 21_000_000_000_000n, feeLabel: '0.000021 tBNB', remainingNativeWei: 1n };

describe('Testnet signing envelope', () => {
  it('binds reviewed transfer data to the current nonce and fee snapshot', () => {
    expect(createTestnetSigningEnvelope({ transfer, snapshot, fee })).toEqual({ ...transfer, nonce: 4, gas: 21_000n, gasPrice: 1_000_000_000n });
  });

  it('fails closed when fee is unavailable or the snapshot changes', () => {
    expect(() => createTestnetSigningEnvelope({ transfer, snapshot, fee: { state: 'unavailable', message: 'unavailable' } })).toThrow('fee estimate');
    expect(() => createTestnetSigningEnvelope({ transfer, snapshot: { ...snapshot, gasPriceWei: 2n }, fee })).toThrow('snapshot changed');
  });
});
