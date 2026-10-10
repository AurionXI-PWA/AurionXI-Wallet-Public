import type { ValidatedTransactionIntent } from './transaction-intent-policy';

export const TESTNET_SEND_AUTHORIZATION_TTL_MS = 90_000;

export type TestnetSendAuthorization = {
  chainId: 97;
  assetId: 'native-bnb' | 'arxi' | 'usdt';
  recipient: ValidatedTransactionIntent['recipient'];
  amount: bigint;
  expiresAt: number;
};

export type TestnetSendAuthorizationResult =
  | { ok: true; authorization: TestnetSendAuthorization }
  | { ok: false; reason: 'vault-locked' | 'wallet-secrets-disabled' | 'signing-disabled' | 'review-not-confirmed' | 'asset-not-approved' };

/**
 * Produces only a short-lived, in-memory authorization. It deliberately has
 * no PIN, biometric, storage, key, RPC, signing, or broadcast dependency.
 */
export function authorizeTestnetSend(input: {
  vaultUnlocked: boolean;
  walletSecretsEnabled: boolean;
  signingEnabled: boolean;
  reviewConfirmed: boolean;
  now: number;
  intent: ValidatedTransactionIntent;
}): TestnetSendAuthorizationResult {
  if (!input.vaultUnlocked) return { ok: false, reason: 'vault-locked' };
  if (!input.walletSecretsEnabled) return { ok: false, reason: 'wallet-secrets-disabled' };
  if (!input.signingEnabled) return { ok: false, reason: 'signing-disabled' };
  if (!input.reviewConfirmed) return { ok: false, reason: 'review-not-confirmed' };
  if (!['native-bnb', 'arxi', 'usdt'].includes(input.intent.asset.id)) {
    return { ok: false, reason: 'asset-not-approved' };
  }

  return {
    ok: true,
    authorization: {
      chainId: 97,
      assetId: input.intent.asset.id,
      recipient: input.intent.recipient,
      amount: input.intent.amount,
      expiresAt: input.now + TESTNET_SEND_AUTHORIZATION_TTL_MS,
    },
  };
}

export function isTestnetSendAuthorizationActive(authorization: TestnetSendAuthorization, now: number): boolean {
  return authorization.chainId === 97 && now < authorization.expiresAt;
}
