import { describe, expect, it } from 'vitest';

import { evaluateSigningFeatureGate } from './signing-feature-gate';

describe('Testnet-only signing feature gate', () => {
  it('is disabled by default even on an allowlisted Testnet', () => {
    expect(evaluateSigningFeatureGate({ chainId: 97, chainIsTestnet: true, requested: false, walletSecretsEnabled: false })).toEqual({
      enabled: false,
      reason: 'disabled-by-default',
    });
  });

  it('permits only explicitly requested BSC Testnet signing', () => {
    expect(evaluateSigningFeatureGate({ chainId: 97, chainIsTestnet: true, requested: true, walletSecretsEnabled: true })).toEqual({
      enabled: true,
      reason: 'enabled',
    });
  });

  it('hard-blocks BSC Mainnet even when requested', () => {
    expect(evaluateSigningFeatureGate({ chainId: 56, chainIsTestnet: false, requested: true, walletSecretsEnabled: true })).toEqual({
      enabled: false,
      reason: 'mainnet-blocked',
    });
  });

  it('blocks unreviewed Testnet chain IDs', () => {
    expect(evaluateSigningFeatureGate({ chainId: 11155111, chainIsTestnet: true, requested: true, walletSecretsEnabled: true })).toEqual({
      enabled: false,
      reason: 'chain-not-allowlisted',
    });
  });

  it('does not trust a false Testnet label on an allowlisted chain ID', () => {
    expect(evaluateSigningFeatureGate({ chainId: 97, chainIsTestnet: false, requested: true, walletSecretsEnabled: true }).enabled).toBe(false);
  });

  it('cannot enable signing while wallet-secret handling is disabled', () => {
    expect(evaluateSigningFeatureGate({
      chainId: 97,
      chainIsTestnet: true,
      requested: true,
      walletSecretsEnabled: false,
    })).toEqual({ enabled: false, reason: 'wallet-secrets-disabled' });
  });
});
