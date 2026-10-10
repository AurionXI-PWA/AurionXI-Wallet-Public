import { describe, expect, it } from 'vitest';

import {
  canExecuteSyntheticVaultReplacement,
  INITIAL_SYNTHETIC_VAULT_REPLACEMENT_STATE,
  transitionSyntheticVaultReplacement,
} from './synthetic-vault-replacement-machine';

describe('synthetic vault replacement state machine', () => {
  it('requires every distinct gate before short-lived execution authority', () => {
    let state = transitionSyntheticVaultReplacement(INITIAL_SYNTHETIC_VAULT_REPLACEMENT_STATE, { type: 'BEGIN' });
    state = transitionSyntheticVaultReplacement(state, { type: 'CURRENT_SYNTHETIC_PIN_VERIFIED' });
    state = transitionSyntheticVaultReplacement(state, { type: 'NEW_RECOVERY_GENERATED' });
    state = transitionSyntheticVaultReplacement(state, { type: 'NEW_RECOVERY_CONFIRMED' });
    state = transitionSyntheticVaultReplacement(state, { type: 'NEW_PIN_VERIFIED' });
    expect(canExecuteSyntheticVaultReplacement(state, 1)).toBe(false);
    state = transitionSyntheticVaultReplacement(state, { type: 'FINAL_CONFIRMATION', now: 1 });
    expect(canExecuteSyntheticVaultReplacement(state, 1)).toBe(true);
    expect(canExecuteSyntheticVaultReplacement(state, 60_001)).toBe(false);
  });

  it('keeps secret values out of serialized state', () => {
    const state = transitionSyntheticVaultReplacement(INITIAL_SYNTHETIC_VAULT_REPLACEMENT_STATE, { type: 'BEGIN' });
    expect(state).not.toHaveProperty('pin');
    expect(state).not.toHaveProperty('phrase');
    expect(state).not.toHaveProperty('mnemonic');
    expect(state).not.toHaveProperty('payload');
    expect(JSON.stringify(state)).not.toMatch(/123456|abandon|private key/i);
  });
});
