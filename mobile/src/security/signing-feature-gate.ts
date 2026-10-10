export const TESTNET_SIGNING_CHAIN_ALLOWLIST = Object.freeze([97] as const);

export type SigningFeatureGate = {
  enabled: boolean;
  reason: 'enabled' | 'disabled-by-default' | 'wallet-secrets-disabled' | 'mainnet-blocked' | 'chain-not-allowlisted';
};

type SigningFeatureInput = {
  chainId: number;
  chainIsTestnet: boolean;
  requested: boolean;
  walletSecretsEnabled: boolean;
};

export function evaluateSigningFeatureGate(input: SigningFeatureInput): SigningFeatureGate {
  if (!input.requested) return { enabled: false, reason: 'disabled-by-default' };
  if (!input.walletSecretsEnabled) return { enabled: false, reason: 'wallet-secrets-disabled' };
  if (!input.chainIsTestnet) return { enabled: false, reason: 'mainnet-blocked' };
  if (!TESTNET_SIGNING_CHAIN_ALLOWLIST.includes(
    input.chainId as (typeof TESTNET_SIGNING_CHAIN_ALLOWLIST)[number],
  )) {
    return { enabled: false, reason: 'chain-not-allowlisted' };
  }
  return { enabled: true, reason: 'enabled' };
}
