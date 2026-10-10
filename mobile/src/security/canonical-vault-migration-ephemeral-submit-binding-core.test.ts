import { describe, expect, it, vi } from 'vitest';

import { CANONICAL_VAULT_MIGRATION_START_CONFIRMATION } from './canonical-vault-migration-start-authorization';
import { dispatchCanonicalVaultMigrationEphemeralSubmit } from './canonical-vault-migration-ephemeral-submit-binding-core';
import { getCanonicalVaultMigrationStartScreenModel } from './canonical-vault-migration-start-screen-core';
import { getCanonicalVaultMigrationStartUiModel } from './canonical-vault-migration-start-ui-model';

function state(stage: 'awaiting-pin' | 'awaiting-confirmation' | 'authorized', busy = false) {
  return {
    busy,
    error: null,
    screen: getCanonicalVaultMigrationStartScreenModel(getCanonicalVaultMigrationStartUiModel({
      authorizationExpiresAt: 61_000,
      scope: {
        candidateCreatedAt: '2026-08-09T00:00:00.000Z',
        candidatePublicAddress: '0x2222222222222222222222222222222222222222',
        replacementTransactionId: 'a'.repeat(32),
      },
      stage,
    })),
  };
}

describe('canonical migration ephemeral submit component binding foundation', () => {
  it.each([
    [state('awaiting-pin'), '123456', { pin: '123456', type: 'VERIFY_PIN_REQUESTED' }],
    [
      state('awaiting-confirmation'),
      CANONICAL_VAULT_MIGRATION_START_CONFIRMATION,
      { confirmation: CANONICAL_VAULT_MIGRATION_START_CONFIRMATION, type: 'CONFIRM_AUTHORIZATION_REQUESTED' },
    ],
    [state('authorized'), '', { type: 'AUTHORIZED_START_REQUESTED' }],
  ] as const)('emits one typed event and requests immediate local clearing', (viewState, value, event) => {
    const emit = vi.fn();
    expect(dispatchCanonicalVaultMigrationEphemeralSubmit(viewState, value, emit)).toEqual({
      dispatched: true,
      nextValue: '',
    });
    expect(emit).toHaveBeenCalledOnce();
    expect(emit).toHaveBeenCalledWith(event);
  });

  it('does not emit or clear invalid or busy input', () => {
    const emit = vi.fn();
    expect(dispatchCanonicalVaultMigrationEphemeralSubmit(state('awaiting-pin'), '12345', emit)).toEqual({
      dispatched: false,
      nextValue: '12345',
    });
    expect(dispatchCanonicalVaultMigrationEphemeralSubmit(state('awaiting-pin', true), '123456', emit)).toEqual({
      dispatched: false,
      nextValue: '123456',
    });
    expect(emit).not.toHaveBeenCalled();
  });

  it('receives only an ephemeral emit callback and no controller or executor', () => {
    expect(dispatchCanonicalVaultMigrationEphemeralSubmit.length).toBe(3);
  });
});
