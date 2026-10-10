import { describe, expect, it } from 'vitest';

import {
  NETWORK_TARGETS,
  PRIVATE_PREVIEW_NETWORK_TARGET,
  canUseNetworkTarget,
} from './network-targets';

describe('shared BSC network target manifest', () => {
  it('keeps the Private Preview bound to the tested BSC Testnet target', () => {
    expect(PRIVATE_PREVIEW_NETWORK_TARGET).toEqual(NETWORK_TARGETS.testnet);
    expect(canUseNetworkTarget(PRIVATE_PREVIEW_NETWORK_TARGET)).toBe(true);
  });

  it('records supplied Mainnet ARXI metadata but keeps the target unavailable', () => {
    expect(NETWORK_TARGETS.mainnet).toMatchObject({
      chainId: 56,
      availability: 'locked',
      arxiContract: '0x6fFEC4860325f8bfB3F000354708A7d0caE4b250',
    });
    expect(canUseNetworkTarget(NETWORK_TARGETS.mainnet)).toBe(false);
  });
});
