import type { MainnetReviewEnvelope } from './mainnet-review-envelope';
import { evaluateMainnetSendSignBoundary } from './mainnet-send-sign-boundary';

export const MAINNET_SECURE_CONFIRMATION_TTL_MS = 90_000;

export type MainnetSecureConfirmation = {
  method: 'pin' | 'biometric';
  verifiedAt: number;
};

export type MainnetSecureConfirmationResult =
  | { ok: false; reason: 'mainnet-wallet-not-created' | 'vault-locked' | 'confirmation-expired' | 'invalid-review-envelope' }
  | {
      ok: false;
      reason: 'mainnet-signing-not-released';
      confirmation: { method: 'pin' | 'biometric'; expiresAt: number };
    };

/**
 * Coordinates a fresh, device-local secure-confirmation outcome with a
 * Mainnet review envelope. The PIN, biometric template, wrapping key, vault
 * content, recovery phrase, and account key never enter this pure module.
 *
 * A successful local confirmation is deliberately not an authorization to
 * sign or broadcast. This function always terminates at the Mainnet
 * hard-default-deny boundary until a separately reviewed release enables it.
 */
export function evaluateMainnetSecureConfirmation(input: {
  mainnetVaultPresent: boolean;
  vaultUnlocked: boolean;
  confirmation: MainnetSecureConfirmation;
  review: MainnetReviewEnvelope;
  now: number;
}): MainnetSecureConfirmationResult {
  if (!input.mainnetVaultPresent) return { ok: false, reason: 'mainnet-wallet-not-created' };
  if (!input.vaultUnlocked) return { ok: false, reason: 'vault-locked' };
  if (input.review.chainId !== 56 || input.review.observedAt > input.now) {
    return { ok: false, reason: 'invalid-review-envelope' };
  }
  if (
    input.confirmation.verifiedAt > input.now
    || input.now - input.confirmation.verifiedAt >= MAINNET_SECURE_CONFIRMATION_TTL_MS
  ) {
    return { ok: false, reason: 'confirmation-expired' };
  }

  const boundary = evaluateMainnetSendSignBoundary({ stage: 'sign', mainnetVaultPresent: true });
  return {
    ok: false,
    reason: boundary.reason,
    confirmation: {
      method: input.confirmation.method,
      expiresAt: input.confirmation.verifiedAt + MAINNET_SECURE_CONFIRMATION_TTL_MS,
    },
  };
}
