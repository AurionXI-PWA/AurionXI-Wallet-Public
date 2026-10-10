import { describe, expect, it } from 'vitest';

import { CANONICAL_VAULT_MIGRATION_START_CONFIRMATION } from './canonical-vault-migration-start-authorization';
import { createCanonicalVaultMigrationLocalSubmitEvent } from './canonical-vault-migration-local-submit-policy';
import { getCanonicalVaultMigrationStartScreenModel } from './canonical-vault-migration-start-screen-core';
import { getCanonicalVaultMigrationStartUiModel } from './canonical-vault-migration-start-ui-model';

function state(
  stage: 'idle' | 'blocked' | 'awaiting-pin' | 'awaiting-confirmation' | 'authorized',
  busy = false,
) {
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
  return {
    busy,
    error: null,
    screen: getCanonicalVaultMigrationStartScreenModel(
      getCanonicalVaultMigrationStartUiModel(authorization),
    ),
  };
}

describe('canonical migration local submit dispatch policy foundation', () => {
  it('creates one normalized ephemeral PIN request only at six digits', () => {
    expect(createCanonicalVaultMigrationLocalSubmitEvent(state('awaiting-pin'), '12a34 56')).toEqual({
      pin: '123456',
      type: 'VERIFY_PIN_REQUESTED',
    });
    expect(createCanonicalVaultMigrationLocalSubmitEvent(state('awaiting-pin'), '12345')).toBeNull();
  });

  it('creates confirmation request only for the exact case-sensitive phrase', () => {
    expect(createCanonicalVaultMigrationLocalSubmitEvent(
      state('awaiting-confirmation'),
      CANONICAL_VAULT_MIGRATION_START_CONFIRMATION,
    )).toEqual({
      confirmation: CANONICAL_VAULT_MIGRATION_START_CONFIRMATION,
      type: 'CONFIRM_AUTHORIZATION_REQUESTED',
    });
    expect(createCanonicalVaultMigrationLocalSubmitEvent(
      state('awaiting-confirmation'),
      CANONICAL_VAULT_MIGRATION_START_CONFIRMATION.toLowerCase(),
    )).toBeNull();
  });

  it('creates an authorized start request without scoped metadata', () => {
    expect(createCanonicalVaultMigrationLocalSubmitEvent(state('authorized'), '')).toEqual({
      type: 'AUTHORIZED_START_REQUESTED',
    });
  });

  it.each([
    [state('idle'), '123456'],
    [state('blocked'), '123456'],
    [state('awaiting-pin', true), '123456'],
    [state('awaiting-confirmation', true), CANONICAL_VAULT_MIGRATION_START_CONFIRMATION],
  ] as const)('returns null for blocked or busy state', (viewState, value) => {
    expect(createCanonicalVaultMigrationLocalSubmitEvent(viewState, value)).toBeNull();
  });

  it('returns data only and invokes no callback', () => {
    const event = createCanonicalVaultMigrationLocalSubmitEvent(state('authorized'), '');
    expect(event).toEqual({ type: 'AUTHORIZED_START_REQUESTED' });
    expect(Object.values(event ?? {}).some((value) => typeof value === 'function')).toBe(false);
    expect(event).not.toHaveProperty('route');
    expect(event).not.toHaveProperty('executor');
  });
});
