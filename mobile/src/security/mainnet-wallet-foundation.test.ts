import { describe, expect, it } from 'vitest';

import { createMainnetWalletFoundation } from './mainnet-wallet-foundation';

describe('Mainnet wallet foundation', () => {
  it('uses a separate empty namespace and never migrates Testnet wallet data', () => {
    expect(createMainnetWalletFoundation()).toMatchObject({
      network: 'bsc-mainnet',
      vaultKey: 'aurionxi.wallet.bsc-mainnet.v1.vault',
      identityKey: 'aurionxi.wallet.bsc-mainnet.v1.identity',
      biometricRegistryKey: 'aurionxi.wallet.bsc-mainnet.v1.biometric-registry',
      migrationFromTestnet: 'prohibited',
      initialVaultState: 'empty',
    });
  });
});
