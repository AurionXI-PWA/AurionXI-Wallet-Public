import { describe, expect, it } from 'vitest';

import {
  getCanonicalVaultMigrationStartScreenModel,
  normalizeCanonicalVaultMigrationStartInput,
} from './canonical-vault-migration-start-screen-core';
import { getCanonicalVaultMigrationStartUiModel } from './canonical-vault-migration-start-ui-model';

describe('unmounted canonical migration start screen foundation', () => {
  it.each([
    ['idle', undefined, false],
    ['blocked', undefined, false],
    ['awaiting-pin', 'Verify PIN', true],
    ['awaiting-confirmation', 'Confirm authorization', false],
    ['authorized', 'Start optimization', false],
  ] as const)('keeps every %s action visibly disabled', (stage, label, secureEntry) => {
    const authorization = stage === 'idle' || stage === 'blocked'
      ? { stage }
      : {
          authorizationExpiresAt: 61_000,
          scope: {
            candidateCreatedAt: '2026-08-09T00:00:00.000Z',
            candidatePublicAddress: '0x2222222222222222222222222222222222222222' as const,
            replacementTransactionId: 'a'.repeat(32),
          },
          stage,
        };
    const screen = getCanonicalVaultMigrationStartScreenModel(
      getCanonicalVaultMigrationStartUiModel(authorization),
    );
    expect(screen.primaryButton?.label).toBe(label);
    if (screen.primaryButton) expect(screen.primaryButton.enabled).toBe(false);
    expect(screen.secureEntry).toBe(secureEntry);
  });

  it('models PIN and confirmation inputs without values or handlers', () => {
    const pin = getCanonicalVaultMigrationStartScreenModel({
      body: 'Verify locally.',
      input: 'pin',
      primaryAction: 'verify-pin',
      severity: 'information',
      title: 'Verify wallet access',
    });
    expect(pin).toEqual(expect.objectContaining({ inputLabel: 'Wallet PIN', secureEntry: true }));
    expect(pin).not.toHaveProperty('value');
    expect(pin).not.toHaveProperty('onChange');
    expect(pin).not.toHaveProperty('onPress');
    expect(pin).not.toHaveProperty('route');
  });

  it('normalizes local PIN and confirmation input without executing an action', () => {
    expect(normalizeCanonicalVaultMigrationStartInput('pin', '12a34 5678')).toBe('123456');
    expect(normalizeCanonicalVaultMigrationStartInput('confirmation', 'OPTIMIZE WALLET STORAGE'))
      .toBe('OPTIMIZE WALLET STORAGE');
    expect(normalizeCanonicalVaultMigrationStartInput('confirmation', 'x'.repeat(80))).toHaveLength(64);
    expect(normalizeCanonicalVaultMigrationStartInput('none', 'blocked')).toBe('');
  });
});
