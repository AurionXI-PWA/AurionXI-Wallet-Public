import { describe, expect, it } from 'vitest';

import { createPinConfirmedSigningSession, isPinConfirmedSigningSessionActive } from './pin-confirmed-signing-session';
import { authorizeTestnetSend } from './testnet-send-authorization';
import { validateTestnetTransactionIntent } from './transaction-intent-policy';

const reviewed = validateTestnetTransactionIntent({ chainId: 97, chainIsTestnet: true, signingEnabled: true, assetId: 'arxi', recipient: '0x1111111111111111111111111111111111111111', amount: '0.01' });
if (!reviewed.ok) throw new Error('Test fixture must be valid.');
const authorized = authorizeTestnetSend({ vaultUnlocked: true, walletSecretsEnabled: true, signingEnabled: true, reviewConfirmed: true, now: 0, intent: reviewed.intent });
if (!authorized.ok) throw new Error('Test fixture must authorize.');

describe('PIN-confirmed signing session', () => {
  it('creates only a short-lived in-memory signing lease after a fresh PIN confirmation', () => {
    const result = createPinConfirmedSigningSession({ vaultUnlocked: true, sendAuthorization: authorized.authorization, pinVerifiedAt: 100, now: 200 });
    expect(result).toMatchObject({ ok: true, session: { chainId: 97, assetId: 'arxi', expiresAt: 90_000 } });
    if (result.ok) expect(isPinConfirmedSigningSessionActive(result.session, 89_999)).toBe(true);
  });

  it('fails closed for a locked vault, expired send authorization, or stale PIN outcome', () => {
    expect(createPinConfirmedSigningSession({ vaultUnlocked: false, sendAuthorization: authorized.authorization, pinVerifiedAt: 1, now: 2 })).toEqual({ ok: false, reason: 'vault-locked' });
    expect(createPinConfirmedSigningSession({ vaultUnlocked: true, sendAuthorization: authorized.authorization, pinVerifiedAt: 0, now: 90_000 })).toEqual({ ok: false, reason: 'send-authorization-expired' });
    expect(createPinConfirmedSigningSession({ vaultUnlocked: true, sendAuthorization: { ...authorized.authorization, expiresAt: 100_000 }, pinVerifiedAt: 0, now: 90_000 })).toEqual({ ok: false, reason: 'pin-confirmation-expired' });
  });
});
