import { describe, expect, it } from 'vitest';

import { ARXI_TOKEN, NETWORK, SIGNING_FEATURE, WALLET_SECRET_FEATURE } from './network';

describe('Blockchain Integration network and asset boundary', () => {
  it('pins the public portfolio to BSC Testnet and the recorded ARXI TokenDiamond', () => {
    expect(NETWORK.chainId).toBe(97);
    expect(NETWORK.chain.testnet).toBe(true);
    expect(NETWORK.name).toBe('BSC Testnet');
    expect(NETWORK.contracts.arxi).toBe('0x3A3f02F22a6Cf16122A7C752B73E65E05Df466fA');
  });

  it('uses the source-verified ARXI identity and precision', () => {
    expect(ARXI_TOKEN).toEqual({
      address: NETWORK.contracts.arxi,
      name: 'AurionXI',
      symbol: 'ARXI',
      decimals: 18,
    });
  });

  it('keeps secret and signing capabilities disabled by default', () => {
    expect(WALLET_SECRET_FEATURE.enabled).toBe(false);
    expect(SIGNING_FEATURE.enabled).toBe(false);
  });
});
