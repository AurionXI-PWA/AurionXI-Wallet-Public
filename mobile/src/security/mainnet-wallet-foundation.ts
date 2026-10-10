import { getNamespacedVaultStorageKey } from './vault-network-namespace';

export type MainnetWalletFoundation = {
  network: 'bsc-mainnet';
  vaultKey: string;
  identityKey: string;
  biometricRegistryKey: string;
  migrationFromTestnet: 'prohibited';
  initialVaultState: 'empty';
};

/**
 * Mainnet always starts as its own empty wallet namespace. Testnet recovery
 * material, encrypted vaults, identity records, and biometric wrapping keys
 * are never copied or promoted into this namespace.
 */
export function createMainnetWalletFoundation(): MainnetWalletFoundation {
  return {
    network: 'bsc-mainnet',
    vaultKey: getNamespacedVaultStorageKey('bsc-mainnet', 'vault'),
    identityKey: getNamespacedVaultStorageKey('bsc-mainnet', 'identity'),
    biometricRegistryKey: getNamespacedVaultStorageKey('bsc-mainnet', 'biometric-registry'),
    migrationFromTestnet: 'prohibited',
    initialVaultState: 'empty',
  };
}
