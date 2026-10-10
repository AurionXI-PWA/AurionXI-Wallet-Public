import { describe, expect, it } from 'vitest';

import { authorizeTestnetSend, isTestnetSendAuthorizationActive } from './testnet-send-authorization';
import { validateTestnetTransactionIntent } from './transaction-intent-policy';

const reviewed = validateTestnetTransactionIntent({
  chainId: 97, chainIsTestnet: true, signingEnabled: true, assetId: 'arxi',
  recipient: '0x1111111111111111111111111111111111111111', amount: '0.01',
});
if (!reviewed.ok) throw new Error('Test fixture must be valid.');

describe('Testnet send authorization', () => {
  it('creates a short-lived authorization only after every safety gate passes', () => {
    const result = authorizeTestnetSend({ vaultUnlocked: true, walletSecretsEnabled: true, signingEnabled: true, reviewConfirmed: true, now: 100, intent: reviewed.intent });
    expect(result).toMatchObject({ ok: true, authorization: { chainId: 97, assetId: 'arxi', expiresAt: 90_100 } });
    if (result.ok) expect(isTestnetSendAuthorizationActive(result.authorization, 90_099)).toBe(true);
  });

  it('fails closed while the vault is locked, signing is disabled, or review is unconfirmed', () => {
    expect(authorizeTestnetSend({ vaultUnlocked: false, walletSecretsEnabled: true, signingEnabled: true, reviewConfirmed: true, now: 0, intent: reviewed.intent })).toEqual({ ok: false, reason: 'vault-locked' });
    expect(authorizeTestnetSend({ vaultUnlocked: true, walletSecretsEnabled: true, signingEnabled: false, reviewConfirmed: true, now: 0, intent: reviewed.intent })).toEqual({ ok: false, reason: 'signing-disabled' });
    expect(authorizeTestnetSend({ vaultUnlocked: true, walletSecretsEnabled: true, signingEnabled: true, reviewConfirmed: false, now: 0, intent: reviewed.intent })).toEqual({ ok: false, reason: 'review-not-confirmed' });
  });
});
