import {
  isTestnetSendAuthorizationActive,
  type TestnetSendAuthorization,
} from './testnet-send-authorization';

export const PIN_CONFIRMATION_TTL_MS = 90_000;

export type PinConfirmedSigningSession = {
  chainId: 97;
  assetId: TestnetSendAuthorization['assetId'];
  recipient: TestnetSendAuthorization['recipient'];
  amount: bigint;
  expiresAt: number;
};

export type PinConfirmedSigningSessionResult =
  | { ok: true; session: PinConfirmedSigningSession }
  | { ok: false; reason: 'vault-locked' | 'send-authorization-expired' | 'pin-confirmation-expired' };

/**
 * Converts a fresh PIN-verification outcome into a narrower signing lease.
 * The PIN itself, vault content, account, and key material never enter this
 * module; all state remains in memory and expires quickly.
 */
export function createPinConfirmedSigningSession(input: {
  vaultUnlocked: boolean;
  sendAuthorization: TestnetSendAuthorization;
  pinVerifiedAt: number;
  now: number;
}): PinConfirmedSigningSessionResult {
  if (!input.vaultUnlocked) return { ok: false, reason: 'vault-locked' };
  if (!isTestnetSendAuthorizationActive(input.sendAuthorization, input.now)) {
    return { ok: false, reason: 'send-authorization-expired' };
  }
  if (input.pinVerifiedAt > input.now || input.now - input.pinVerifiedAt >= PIN_CONFIRMATION_TTL_MS) {
    return { ok: false, reason: 'pin-confirmation-expired' };
  }
  return {
    ok: true,
    session: {
      chainId: 97,
      assetId: input.sendAuthorization.assetId,
      recipient: input.sendAuthorization.recipient,
      amount: input.sendAuthorization.amount,
      expiresAt: Math.min(input.sendAuthorization.expiresAt, input.pinVerifiedAt + PIN_CONFIRMATION_TTL_MS),
    },
  };
}

export function isPinConfirmedSigningSessionActive(session: PinConfirmedSigningSession, now: number): boolean {
  return session.chainId === 97 && now < session.expiresAt;
}
