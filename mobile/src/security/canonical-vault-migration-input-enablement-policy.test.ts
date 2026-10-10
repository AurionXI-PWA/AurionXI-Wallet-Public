import { describe, expect, it } from 'vitest';

import { CANONICAL_VAULT_MIGRATION_START_CONFIRMATION } from './canonical-vault-migration-start-authorization';
import { getCanonicalVaultMigrationInputEnablement } from './canonical-vault-migration-input-enablement-policy';
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

describe('canonical migration interactive input enablement safety policy', () => {
  it.each([
    ['1', false],
    ['12345', false],
    ['123456', true],
    ['12a34 56', true],
    ['1234567', true],
  ] as const)('permits PIN submit only for six normalized digits: %s', (value, locallyEligible) => {
    expect(getCanonicalVaultMigrationInputEnablement(state('awaiting-pin'), value)).toEqual({
      action: 'verify-pin',
      editable: true,
      locallyEligible,
      normalizedValue: value.replace(/\D/g, '').slice(0, 6),
    });
  });

  it('requires the exact case-sensitive confirmation phrase', () => {
    expect(getCanonicalVaultMigrationInputEnablement(
      state('awaiting-confirmation'),
      CANONICAL_VAULT_MIGRATION_START_CONFIRMATION,
    )).toEqual(expect.objectContaining({ editable: true, locallyEligible: true }));
    expect(getCanonicalVaultMigrationInputEnablement(
      state('awaiting-confirmation'),
      CANONICAL_VAULT_MIGRATION_START_CONFIRMATION.toLowerCase(),
    )).toEqual(expect.objectContaining({ editable: true, locallyEligible: false }));
  });

  it.each(['idle', 'blocked'] as const)('keeps %s non-editable and ineligible', (stage) => {
    expect(getCanonicalVaultMigrationInputEnablement(state(stage), '123456')).toEqual({
      action: 'none',
      editable: false,
      locallyEligible: false,
      normalizedValue: '',
    });
  });

  it('disables editing and local submit while any controller action is busy', () => {
    expect(getCanonicalVaultMigrationInputEnablement(state('awaiting-pin', true), '123456'))
      .toEqual(expect.objectContaining({ editable: false, locallyEligible: false }));
    expect(getCanonicalVaultMigrationInputEnablement(
      state('awaiting-confirmation', true),
      CANONICAL_VAULT_MIGRATION_START_CONFIRMATION,
    )).toEqual(expect.objectContaining({ editable: false, locallyEligible: false }));
  });

  it('marks authorized start locally eligible without enabling a text field', () => {
    expect(getCanonicalVaultMigrationInputEnablement(state('authorized'), 'ignored')).toEqual({
      action: 'submit-authorized-start',
      editable: false,
      locallyEligible: true,
      normalizedValue: '',
    });
  });

  it('returns data only and exposes no handler, verifier, route, or executor', () => {
    const result = getCanonicalVaultMigrationInputEnablement(state('awaiting-pin'), '123456');
    expect(Object.values(result).some((value) => typeof value === 'function')).toBe(false);
    expect(result).not.toHaveProperty('onSubmit');
    expect(result).not.toHaveProperty('route');
    expect(result).not.toHaveProperty('execute');
  });
});
