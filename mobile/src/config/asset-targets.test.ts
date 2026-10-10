import { describe, expect, it } from 'vitest';

import { canReadAssetTarget, getAssetTargetsForNetwork } from './asset-targets';
import { NETWORK_TARGETS } from './network-targets';

describe('shared BSC asset targets', () => {
  it('preserves the reviewed Testnet allowlist', () => {
    const assets = getAssetTargetsForNetwork(NETWORK_TARGETS.testnet);
    expect(assets.map((asset) => asset.symbol)).toEqual(['tBNB', 'ARXI', 'USDT']);
    expect(assets.every(canReadAssetTarget)).toBe(true);
  });

  it('keeps the fixed Mainnet allowlist available for public reads', () => {
    const assets = getAssetTargetsForNetwork(NETWORK_TARGETS.mainnet);
    expect(assets.map((asset) => asset.symbol)).toEqual(['BNB', 'ARXI', 'USDT', 'USDC', 'ETH', 'BTCB']);
    expect(assets.every((asset) => asset.id === 'native-bnb' || asset.address)).toBe(true);
    expect(assets.every(canReadAssetTarget)).toBe(true);
    expect(assets.find((asset) => asset.id === 'arxi')?.address)
      .toBe('0x6fFEC4860325f8bfB3F000354708A7d0caE4b250');
  });
});
