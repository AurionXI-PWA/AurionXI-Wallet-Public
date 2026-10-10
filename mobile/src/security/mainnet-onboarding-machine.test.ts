import { describe, expect, it } from 'vitest';

import {
  canAccessMainnetOnboardingRoute,
  getMainnetOnboardingEntry,
  INITIAL_MAINNET_ONBOARDING_STATE,
  transitionMainnetOnboarding,
  type MainnetOnboardingEvent,
} from './mainnet-onboarding-machine';

function run(events: MainnetOnboardingEvent[]) {
  return events.reduce(transitionMainnetOnboarding, INITIAL_MAINNET_ONBOARDING_STATE);
}

describe('Mainnet onboarding machine', () => {
  it('requires its own responsibility, recovery confirmation, and PIN gates', () => {
    const awaitingConfirmation = run([
      { type: 'BEGIN_CREATE' },
      { type: 'ACCEPT_RESPONSIBILITY' },
      { type: 'RECOVERY_MATERIAL_READY' },
      { type: 'PIN_CONFIGURED' },
    ]);
    expect(awaitingConfirmation).toMatchObject({ network: 'bsc-mainnet', stage: 'recovery-confirmation', recoveryScope: 'mainnet-only' });
    expect(transitionMainnetOnboarding(awaitingConfirmation, { type: 'CONFIRM_RECOVERY' }).stage).toBe('pin-setup');
  });

  it('supports import only after recovery material is verified and never embeds it in state', () => {
    const state = run([{ type: 'BEGIN_IMPORT' }, { type: 'ACCEPT_RESPONSIBILITY' }, { type: 'RECOVERY_MATERIAL_READY' }]);
    expect(state.stage).toBe('pin-setup');
    expect(JSON.stringify(state)).not.toMatch(/mnemonic|privateKey|recoveryPhrase/i);
  });

  it('prevents direct routes and prevents setup from replacing an existing Mainnet vault', () => {
    expect(canAccessMainnetOnboardingRoute(INITIAL_MAINNET_ONBOARDING_STATE, 'pin-setup')).toBe(false);
    expect(getMainnetOnboardingEntry(false)).toEqual({ state: 'setup-required', action: 'create-or-import' });
    expect(getMainnetOnboardingEntry(true)).toEqual({ state: 'existing-vault', action: 'unlock-only' });
  });
});
