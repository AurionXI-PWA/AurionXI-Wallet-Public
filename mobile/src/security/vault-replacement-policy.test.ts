import { describe, expect, it } from 'vitest';

import {
  canExecuteVaultReplacement,
  INITIAL_VAULT_REPLACEMENT_STATE,
  transitionVaultReplacement,
  VAULT_REPLACEMENT_AUTHORIZATION_MS,
  type VaultReplacementEvent,
} from './vault-replacement-policy';

function run(events: VaultReplacementEvent[]) {
  return events.reduce(transitionVaultReplacement, INITIAL_VAULT_REPLACEMENT_STATE);
}

describe('explicit vault replacement authorization policy', () => {
  it('requires existing PIN verification for a valid vault', () => {
    const awaiting = run([{ type: 'BEGIN', status: 'present' }]);
    expect(awaiting.requiredAuthentication).toBe('pin');
    expect(transitionVaultReplacement(awaiting, { type: 'RECOVERY_VERIFIED', now: 1 })).toBe(awaiting);
    const confirmed = run([
      { type: 'BEGIN', status: 'present' },
      { type: 'PIN_VERIFIED', now: 1 },
      { type: 'CONFIRM', confirmation: 'REPLACE', now: 2 },
    ]);
    expect(canExecuteVaultReplacement(confirmed, 2)).toBe(true);
  });

  it('requires recovery verification for corrupt storage and rejects PIN bypass', () => {
    const awaiting = run([{ type: 'BEGIN', status: 'corrupt' }]);
    expect(awaiting.requiredAuthentication).toBe('recovery');
    expect(transitionVaultReplacement(awaiting, { type: 'PIN_VERIFIED', now: 1 })).toBe(awaiting);
    const authorized = run([
      { type: 'BEGIN', status: 'corrupt' },
      { type: 'RECOVERY_VERIFIED', now: 1 },
      { type: 'CONFIRM', confirmation: 'REPLACE', now: 2 },
    ]);
    expect(canExecuteVaultReplacement(authorized, 2)).toBe(true);
  });

  it.each(['empty', 'unsupported'] as const)('blocks replacement for %s storage', (status) => {
    expect(run([{ type: 'BEGIN', status }])).toEqual({ stage: 'blocked' });
  });

  it('requires exact case-sensitive destructive confirmation', () => {
    const state = run([
      { type: 'BEGIN', status: 'present' },
      { type: 'PIN_VERIFIED', now: 1 },
      { type: 'CONFIRM', confirmation: 'replace', now: 2 },
    ]);
    expect(state.stage).toBe('awaiting-confirmation');
    expect(canExecuteVaultReplacement(state, 2)).toBe(false);
  });

  it('expires authorization and fails closed at the exact boundary', () => {
    const state = run([
      { type: 'BEGIN', status: 'present' },
      { type: 'PIN_VERIFIED', now: 100 },
      { type: 'CONFIRM', confirmation: 'REPLACE', now: 101 },
    ]);
    expect(canExecuteVaultReplacement(state, 100 + VAULT_REPLACEMENT_AUTHORIZATION_MS - 1)).toBe(true);
    expect(canExecuteVaultReplacement(state, 100 + VAULT_REPLACEMENT_AUTHORIZATION_MS)).toBe(false);
    expect(transitionVaultReplacement(state, {
      type: 'CHECK_EXPIRY',
      now: 100 + VAULT_REPLACEMENT_AUTHORIZATION_MS,
    })).toEqual(INITIAL_VAULT_REPLACEMENT_STATE);
  });

  it('reset removes all replacement authority and stores no secrets', () => {
    const state = run([
      { type: 'BEGIN', status: 'corrupt' },
      { type: 'RECOVERY_VERIFIED', now: 1 },
    ]);
    const reset = transitionVaultReplacement(state, { type: 'RESET' });
    expect(reset).toEqual(INITIAL_VAULT_REPLACEMENT_STATE);
    expect(JSON.stringify(state)).not.toMatch(/mnemonic|phrase/i);
  });
});
