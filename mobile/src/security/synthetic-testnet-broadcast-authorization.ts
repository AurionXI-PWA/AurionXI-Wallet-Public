import type { Address } from 'viem';

import type { ValidatedTransactionIntent } from './transaction-intent-policy';

export const SYNTHETIC_TESTNET_CONFIRMATION = 'CONFIRM TESTNET TRANSACTION';
export const SYNTHETIC_TESTNET_AUTHORIZATION_TTL_MS = 60_000;
export const SYNTHETIC_TESTNET_MAX_ARXI_BASE_UNITS = 100_000_000_000_000_000n; // 0.1 ARXI

export type SyntheticTestnetBroadcastAuthorization = {
  chainId: 97;
  assetId: 'arxi';
  recipient: Address;
  amount: bigint;
  expiresAt: number;
};

export type SyntheticTestnetAuthorizationResult =
  | { ok: true; authorization: SyntheticTestnetBroadcastAuthorization }
  | {
      ok: false;
      reason:
        | 'debug-build-required'
        | 'wallet-secrets-disabled'
        | 'signing-disabled'
        | 'asset-not-approved'
        | 'amount-above-test-cap'
        | 'confirmation-mismatch';
    };

type SyntheticTestnetAuthorizationInput = {
  debugBuild: boolean;
  walletSecretsEnabled: boolean;
  signingEnabled: boolean;
  confirmation: string;
  now: number;
  intent: ValidatedTransactionIntent;
};

/**
 * Produces an in-memory authorization record only. It has no signer, account,
 * storage, RPC, transaction, or broadcast dependency.
 */
export function authorizeSyntheticTestnetBroadcast(
  input: SyntheticTestnetAuthorizationInput,
): SyntheticTestnetAuthorizationResult {
  if (!input.debugBuild) return { ok: false, reason: 'debug-build-required' };
  if (!input.walletSecretsEnabled) return { ok: false, reason: 'wallet-secrets-disabled' };
  if (!input.signingEnabled) return { ok: false, reason: 'signing-disabled' };
  if (input.intent.asset.id !== 'arxi') return { ok: false, reason: 'asset-not-approved' };
  if (input.intent.amount > SYNTHETIC_TESTNET_MAX_ARXI_BASE_UNITS) {
    return { ok: false, reason: 'amount-above-test-cap' };
  }
  if (input.confirmation.trim() !== SYNTHETIC_TESTNET_CONFIRMATION) {
    return { ok: false, reason: 'confirmation-mismatch' };
  }

  return {
    ok: true,
    authorization: {
      chainId: 97,
      assetId: 'arxi',
      recipient: input.intent.recipient,
      amount: input.intent.amount,
      expiresAt: input.now + SYNTHETIC_TESTNET_AUTHORIZATION_TTL_MS,
    },
  };
}

export function isSyntheticTestnetBroadcastAuthorizationActive(
  authorization: SyntheticTestnetBroadcastAuthorization,
  now: number,
): boolean {
  return authorization.chainId === 97 && now < authorization.expiresAt;
}
