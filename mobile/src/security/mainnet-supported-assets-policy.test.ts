import { describe, expect, it } from 'vitest';

import { getMainnetSupportedAssets } from './mainnet-supported-assets-policy';

describe('Mainnet supported assets policy', () => {
  it('permits public read and receive for every fixed curated asset', () => {
    const assets = getMainnetSupportedAssets();
    expect(assets.map(({ asset, canRead, canReceive, canPrepareSend, canSend }) => [asset.symbol, canRead, canReceive, canPrepareSend, canSend]))
      .toEqual([
        ['BNB', true, true, true, false], ['ARXI', true, true, true, false],
        ['USDT', true, true, true, false], ['USDC', true, true, false, false],
        ['ETH', true, true, false, false], ['BTCB', true, true, false, false],
      ]);
  });

  it('does not grant broadcast or swap authority from display metadata', () => {
    expect(getMainnetSupportedAssets().every(({ canSend, canSwap }) => !canSend && !canSwap)).toBe(true);
    expect(getMainnetSupportedAssets().filter(({ canPrepareSend }) => canPrepareSend).map(({ asset }) => asset.symbol)).toEqual(['BNB', 'ARXI', 'USDT']);
  });
});
