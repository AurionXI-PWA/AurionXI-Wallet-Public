import { describe, expect, it } from 'vitest';

import {
  areVaultNamespacesSeparated,
  getNamespacedVaultStorageKey,
  getVaultNetworkNamespacePrefix,
} from './vault-network-namespace';

describe('vault network namespaces', () => {
  it('gives Testnet and Mainnet distinct encrypted-storage prefixes', () => {
    expect(getVaultNetworkNamespacePrefix('bsc-testnet')).toBe('aurionxi.wallet.bsc-testnet.v1');
    expect(getVaultNetworkNamespacePrefix('bsc-mainnet')).toBe('aurionxi.wallet.bsc-mainnet.v1');
    expect(areVaultNamespacesSeparated('bsc-testnet', 'bsc-mainnet')).toBe(true);
  });

  it('keeps each sensitive storage purpose distinct within a network', () => {
    const keys = [
      getNamespacedVaultStorageKey('bsc-mainnet', 'vault'),
      getNamespacedVaultStorageKey('bsc-mainnet', 'identity'),
      getNamespacedVaultStorageKey('bsc-mainnet', 'biometric-registry'),
      getNamespacedVaultStorageKey('bsc-mainnet', 'migration-journal'),
    ];
    expect(new Set(keys).size).toBe(keys.length);
  });
});
