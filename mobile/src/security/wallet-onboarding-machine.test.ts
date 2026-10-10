import { describe, expect, it } from 'vitest';

import {
  canAccessWalletOnboardingRoute,
  INITIAL_ONBOARDING_STATE,
  transitionWalletOnboarding,
  type WalletOnboardingEvent,
} from './wallet-onboarding-machine';

function run(events: WalletOnboardingEvent[]) {
  return events.reduce(transitionWalletOnboarding, INITIAL_ONBOARDING_STATE);
}

describe('wallet onboarding state machine', () => {
  it('requires responsibility, backup confirmation, and PIN for create flow', () => {
    const beforeConfirmation = run([
      { type: 'BEGIN_CREATE' },
      { type: 'ACCEPT_RESPONSIBILITY' },
      { type: 'RECOVERY_MATERIAL_READY' },
      { type: 'PIN_CONFIGURED' },
    ]);
    expect(beforeConfirmation.stage).toBe('recovery-confirmation');

    const complete = transitionWalletOnboarding(beforeConfirmation, {
      type: 'CONFIRM_RECOVERY',
    });
    expect(transitionWalletOnboarding(complete, { type: 'PIN_CONFIGURED' }).stage).toBe(
      'ready',
    );
  });

  it('requires validated recovery material before import PIN setup', () => {
    const state = run([
      { type: 'BEGIN_IMPORT' },
      { type: 'ACCEPT_RESPONSIBILITY' },
      { type: 'PIN_CONFIGURED' },
    ]);
    expect(state.stage).toBe('recovery-entry');

    const readyForPin = transitionWalletOnboarding(state, {
      type: 'RECOVERY_MATERIAL_READY',
    });
    expect(readyForPin.stage).toBe('pin-setup');
    expect(readyForPin.recoveryVerified).toBe(true);
  });

  it('stores no recovery phrase or PIN in machine state or events', () => {
    const serialized = JSON.stringify(
      run([
        { type: 'BEGIN_CREATE' },
        { type: 'ACCEPT_RESPONSIBILITY' },
        { type: 'RECOVERY_MATERIAL_READY' },
      ]),
    );
    expect(serialized).not.toMatch(/mnemonic|privateKey|pin/i);
  });

  it('denies direct route access until each prerequisite is complete', () => {
    const responsibility = run([{ type: 'BEGIN_CREATE' }]);
    expect(canAccessWalletOnboardingRoute(responsibility, 'responsibility')).toBe(true);
    expect(canAccessWalletOnboardingRoute(responsibility, 'recovery')).toBe(false);
    expect(canAccessWalletOnboardingRoute(responsibility, 'pin-setup')).toBe(false);

    const recovery = transitionWalletOnboarding(responsibility, { type: 'ACCEPT_RESPONSIBILITY' });
    expect(canAccessWalletOnboardingRoute(recovery, 'responsibility')).toBe(false);
    expect(canAccessWalletOnboardingRoute(recovery, 'recovery')).toBe(true);
    expect(canAccessWalletOnboardingRoute(recovery, 'pin-setup')).toBe(false);

    const confirmation = transitionWalletOnboarding(recovery, { type: 'RECOVERY_MATERIAL_READY' });
    const pinSetup = transitionWalletOnboarding(confirmation, { type: 'CONFIRM_RECOVERY' });
    expect(canAccessWalletOnboardingRoute(pinSetup, 'recovery')).toBe(false);
    expect(canAccessWalletOnboardingRoute(pinSetup, 'pin-setup')).toBe(true);
  });

  it('reset clears all unfinished-flow authority', () => {
    const inProgress = run([
      { type: 'BEGIN_IMPORT' },
      { type: 'ACCEPT_RESPONSIBILITY' },
      { type: 'RECOVERY_MATERIAL_READY' },
    ]);
    const reset = transitionWalletOnboarding(inProgress, { type: 'RESET' });
    expect(reset).toEqual(INITIAL_ONBOARDING_STATE);
    expect(canAccessWalletOnboardingRoute(reset, 'pin-setup')).toBe(false);
  });
});
