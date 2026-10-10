import { describe, expect, it } from 'vitest';

import {
  CANONICAL_VAULT_MIGRATION_CALLBACK_FAILURE_MESSAGE,
  getCanonicalVaultMigrationCallbackFailureViewState,
  getCanonicalVaultMigrationRetryStartedViewState,
  recoverCanonicalVaultMigrationCallbackFailureViewState,
} from './canonical-vault-migration-start-failure-ui-signal-core';

const state = {
  busy: true,
  error: null,
  screen: {
    body: 'Ready.',
    input: 'none' as const,
    primaryAction: 'none' as const,
    secureEntry: false,
    severity: 'information' as const,
    title: 'Wallet storage optimization',
  },
};

describe('canonical migration callback failure UI signal foundation', () => {
  it('publishes one fixed secret-free English message', () => {
    expect(getCanonicalVaultMigrationCallbackFailureViewState(state)).toEqual({
      ...state,
      busy: false,
      error: CANONICAL_VAULT_MIGRATION_CALLBACK_FAILURE_MESSAGE,
    });
  });

  it('preserves the current screen without accepting raw failure details', () => {
    const result = getCanonicalVaultMigrationCallbackFailureViewState(state);
    expect(result.screen).toBe(state.screen);
    expect(getCanonicalVaultMigrationCallbackFailureViewState.length).toBe(1);
    expect(JSON.stringify(result)).not.toContain('exception');
    expect(JSON.stringify(result)).not.toContain('PIN');
  });

  it('does not mutate the prior view state', () => {
    const result = getCanonicalVaultMigrationCallbackFailureViewState(state);
    expect(result).not.toBe(state);
    expect(state).toEqual(expect.objectContaining({ busy: true, error: null }));
  });

  it('applies the generic signal to a fresh PIN recovery state', () => {
    const pinState = {
      ...state,
      busy: false,
      screen: {
        ...state.screen,
        input: 'pin' as const,
        primaryAction: 'verify-pin' as const,
        severity: 'information' as const,
        title: 'Verify wallet access',
      },
    };
    const result = recoverCanonicalVaultMigrationCallbackFailureViewState(() => pinState, state);
    expect(result.screen.title).toBe('Verify wallet access');
    expect(result.screen.input).toBe('pin');
    expect(result.error).toBe(CANONICAL_VAULT_MIGRATION_CALLBACK_FAILURE_MESSAGE);
  });

  it('uses the safe fallback state when local restart fails', () => {
    const result = recoverCanonicalVaultMigrationCallbackFailureViewState(
      () => { throw new Error('restart detail'); },
      state,
    );
    expect(result.screen).toBe(state.screen);
    expect(result.error).toBe(CANONICAL_VAULT_MIGRATION_CALLBACK_FAILURE_MESSAGE);
    expect(JSON.stringify(result)).not.toContain('restart detail');
  });

  it('clears the generic message as soon as a fresh PIN retry starts', () => {
    const recoveryState = getCanonicalVaultMigrationCallbackFailureViewState(state);
    const result = getCanonicalVaultMigrationRetryStartedViewState(
      recoveryState,
      'VERIFY_PIN_REQUESTED',
    );
    expect(result).toEqual(expect.objectContaining({ busy: true, error: null }));
    expect(result).not.toBe(recoveryState);
    expect(recoveryState.error).toBe(CANONICAL_VAULT_MIGRATION_CALLBACK_FAILURE_MESSAGE);
  });

  it('does not change recovery presentation for non-PIN events', () => {
    const recoveryState = getCanonicalVaultMigrationCallbackFailureViewState(state);
    expect(getCanonicalVaultMigrationRetryStartedViewState(
      recoveryState,
      'CONFIRM_AUTHORIZATION_REQUESTED',
    )).toBe(recoveryState);
    expect(getCanonicalVaultMigrationRetryStartedViewState(
      recoveryState,
      'AUTHORIZED_START_REQUESTED',
    )).toBe(recoveryState);
  });

  it('accepts only an event type and cannot return a submitted PIN', () => {
    const result = getCanonicalVaultMigrationRetryStartedViewState(state, 'VERIFY_PIN_REQUESTED');
    expect(getCanonicalVaultMigrationRetryStartedViewState.length).toBe(2);
    expect(JSON.stringify(result)).not.toContain('123456');
  });
});
