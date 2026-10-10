import { describe, expect, it } from 'vitest';

import { getPublicAsset, PUBLIC_ASSETS } from './assets';
import { ARXI_TOKEN } from './network';

describe('BSC Testnet public asset registry', () => {
  it('contains only reviewed BSC Testnet assets', () => {
    expect(PUBLIC_ASSETS.map((asset) => asset.id)).toEqual(['native-bnb', 'arxi', 'usdt']);
    expect(PUBLIC_ASSETS.every((asset) => asset.decimals === 18)).toBe(true);
  });

  it('binds ARXI to the verified metadata and contract address', () => {
    expect(getPublicAsset('arxi')).toMatchObject(ARXI_TOKEN);
    expect(getPublicAsset('arxi')?.kind).toBe('bep20');
  });

  it('pins USDT to the reviewed BSC Testnet contract and precision', () => {
    expect(getPublicAsset('usdt')).toMatchObject({
      address: '0x337610d27c682E347C9cD60BD4b3b107C9d34dDd',
      decimals: 18,
      symbol: 'USDT',
    });
  });

  it('does not return an asset outside the explicit allowlist', () => {
    expect(getPublicAsset('unknown' as never)).toBeUndefined();
  });
});
