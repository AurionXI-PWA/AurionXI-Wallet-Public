import {
  getNamespacedVaultStorageKey,
  type VaultNetworkNamespace,
} from './vault-network-namespace';

export type VaultNetworkMigrationPlan = {
  target: VaultNetworkNamespace;
  action: 'copy-testnet-legacy-after-verification' | 'create-empty-mainnet-namespace' | 'no-action';
  sourceKeys: readonly string[];
  targetKeys: readonly string[];
  requiresFreshPinVerification: boolean;
  requiresReadBackVerification: boolean;
  permitsLegacyDeletion: false;
};

const LEGACY_TESTNET_KEYS = [
  'aurionxi.wallet.vault.v3',
  'aurionxi.wallet.authoritative-identity.v1',
  'aurionxi.wallet.biometric-wrap.registry.v1',
] as const;

function targetKeys(target: VaultNetworkNamespace): readonly string[] {
  return [
    getNamespacedVaultStorageKey(target, 'vault'),
    getNamespacedVaultStorageKey(target, 'identity'),
    getNamespacedVaultStorageKey(target, 'biometric-registry'),
    getNamespacedVaultStorageKey(target, 'migration-journal'),
  ];
}

/**
 * Planning only: it does not read, write, copy or delete SecureStore data.
 * Mainnet never receives a copy of an existing Testnet encrypted vault.
 */
export function createVaultNetworkMigrationPlan(input: {
  target: VaultNetworkNamespace;
  targetAlreadyInitialized: boolean;
}): VaultNetworkMigrationPlan {
  if (input.targetAlreadyInitialized) {
    return {
      target: input.target,
      action: 'no-action',
      sourceKeys: [],
      targetKeys: targetKeys(input.target),
      requiresFreshPinVerification: false,
      requiresReadBackVerification: false,
      permitsLegacyDeletion: false,
    };
  }

  if (input.target === 'bsc-mainnet') {
    return {
      target: input.target,
      action: 'create-empty-mainnet-namespace',
      sourceKeys: [],
      targetKeys: targetKeys(input.target),
      requiresFreshPinVerification: true,
      requiresReadBackVerification: true,
      permitsLegacyDeletion: false,
    };
  }

  return {
    target: input.target,
    action: 'copy-testnet-legacy-after-verification',
    sourceKeys: LEGACY_TESTNET_KEYS,
    targetKeys: targetKeys(input.target),
    requiresFreshPinVerification: true,
    requiresReadBackVerification: true,
    permitsLegacyDeletion: false,
  };
}

