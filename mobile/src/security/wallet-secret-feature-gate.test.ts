import { describe, expect, it } from 'vitest';

import { evaluateWalletSecretFeatureGate } from './wallet-secret-feature-gate';

describe('wallet-secret activation gate', () => {
  it('is disabled by default on BSC Testnet', () => {
    expect(evaluateWalletSecretFeatureGate({
      chainId: 97,
      chainIsTestnet: true,
      requested: false,
    })).toEqual({ enabled: false, reason: 'disabled-by-default' });
  });

  it('becomes eligible only for explicitly requested BSC Testnet builds', () => {
    expect(evaluateWalletSecretFeatureGate({
      chainId: 97,
      chainIsTestnet: true,
      requested: true,
    })).toEqual({ enabled: true, reason: 'enabled' });
  });

  it('hard-blocks BSC Mainnet even if requested', () => {
    expect(evaluateWalletSecretFeatureGate({
      chainId: 56,
      chainIsTestnet: false,
      requested: true,
    })).toEqual({ enabled: false, reason: 'mainnet-blocked' });
  });

  it('blocks unreviewed Testnet chains', () => {
    expect(evaluateWalletSecretFeatureGate({
      chainId: 11155111,
      chainIsTestnet: true,
      requested: true,
    })).toEqual({ enabled: false, reason: 'chain-not-allowlisted' });
  });

  it('does not trust an allowlisted ID with non-Testnet metadata', () => {
    expect(evaluateWalletSecretFeatureGate({
      chainId: 97,
      chainIsTestnet: false,
      requested: true,
    }).enabled).toBe(false);
  });
});
