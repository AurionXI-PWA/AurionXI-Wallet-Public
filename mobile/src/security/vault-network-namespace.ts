export type VaultNetworkNamespace = 'bsc-testnet' | 'bsc-mainnet';

/**
 * Every future encrypted-vault key, identity record, biometric registry and
 * migration journal must be derived from this namespace. The current preview
 * uses legacy unscoped storage and is intentionally not migrated here.
 */
export function getVaultNetworkNamespacePrefix(
  network: VaultNetworkNamespace,
): string {
  return `aurionxi.wallet.${network}.v1`;
}

export function getNamespacedVaultStorageKey(
  network: VaultNetworkNamespace,
  purpose: 'vault' | 'identity' | 'biometric-registry' | 'migration-journal',
): string {
  return `${getVaultNetworkNamespacePrefix(network)}.${purpose}`;
}

export function areVaultNamespacesSeparated(
  left: VaultNetworkNamespace,
  right: VaultNetworkNamespace,
): boolean {
  return left !== right
    && getVaultNetworkNamespacePrefix(left) !== getVaultNetworkNamespacePrefix(right);
}

