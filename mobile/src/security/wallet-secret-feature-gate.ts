export const WALLET_SECRET_CHAIN_ALLOWLIST = Object.freeze([97] as const);

export type WalletSecretFeatureGate = {
  enabled: boolean;
  reason: 'enabled' | 'disabled-by-default' | 'mainnet-blocked' | 'chain-not-allowlisted';
};

type WalletSecretFeatureInput = {
  chainId: number;
  chainIsTestnet: boolean;
  requested: boolean;
};

export function evaluateWalletSecretFeatureGate(
  input: WalletSecretFeatureInput,
): WalletSecretFeatureGate {
  if (!input.requested) return { enabled: false, reason: 'disabled-by-default' };
  if (!input.chainIsTestnet) return { enabled: false, reason: 'mainnet-blocked' };
  if (!WALLET_SECRET_CHAIN_ALLOWLIST.includes(
    input.chainId as (typeof WALLET_SECRET_CHAIN_ALLOWLIST)[number],
  )) {
    return { enabled: false, reason: 'chain-not-allowlisted' };
  }
  return { enabled: true, reason: 'enabled' };
}
