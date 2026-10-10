export type MainnetOnboardingFlow = 'create' | 'import';

export type MainnetOnboardingStage =
  | 'choice'
  | 'responsibility'
  | 'recovery-display'
  | 'recovery-entry'
  | 'recovery-confirmation'
  | 'pin-setup'
  | 'ready';

export type MainnetOnboardingState = {
  network: 'bsc-mainnet';
  stage: MainnetOnboardingStage;
  flow?: MainnetOnboardingFlow;
  responsibilityAccepted: boolean;
  recoveryVerified: boolean;
  /** Never accept migration or promotion from any other-network vault. */
  recoveryScope: 'mainnet-only';
};

export type MainnetOnboardingEvent =
  | { type: 'BEGIN_CREATE' }
  | { type: 'BEGIN_IMPORT' }
  | { type: 'ACCEPT_RESPONSIBILITY' }
  | { type: 'RECOVERY_MATERIAL_READY' }
  | { type: 'CONFIRM_RECOVERY' }
  | { type: 'PIN_CONFIGURED' }
  | { type: 'BACK' }
  | { type: 'RESET' };

export type MainnetOnboardingRoute = 'responsibility' | 'recovery' | 'pin-setup';

export const INITIAL_MAINNET_ONBOARDING_STATE: MainnetOnboardingState = {
  network: 'bsc-mainnet',
  stage: 'choice',
  responsibilityAccepted: false,
  recoveryVerified: false,
  recoveryScope: 'mainnet-only',
};

/**
 * Determines the entry affordance using a public vault-presence result. It
 * never reads encrypted vault material and prevents onboarding from replacing
 * an existing independent Mainnet vault from being replaced.
 */
export function getMainnetOnboardingEntry(mainnetVaultPresent: boolean):
  | { state: 'setup-required'; action: 'create-or-import' }
  | { state: 'existing-vault'; action: 'unlock-only' } {
  return mainnetVaultPresent
    ? { state: 'existing-vault', action: 'unlock-only' }
    : { state: 'setup-required', action: 'create-or-import' };
}

export function canAccessMainnetOnboardingRoute(
  state: MainnetOnboardingState,
  route: MainnetOnboardingRoute,
): boolean {
  if (route === 'responsibility') return state.stage === 'responsibility' && !!state.flow;
  if (route === 'recovery') {
    return !!state.flow && state.responsibilityAccepted && (
      state.stage === 'recovery-display'
      || state.stage === 'recovery-entry'
      || state.stage === 'recovery-confirmation'
    );
  }
  return !!state.flow && state.responsibilityAccepted && state.recoveryVerified && (
    state.stage === 'pin-setup' || state.stage === 'ready'
  );
}

/**
 * This state machine contains no PIN or recovery material. Native creation,
 * recovery validation, and vault persistence may only be called by a later
 * explicit Mainnet onboarding executor after the corresponding state gates
 * are satisfied.
 */
export function transitionMainnetOnboarding(
  state: MainnetOnboardingState,
  event: MainnetOnboardingEvent,
): MainnetOnboardingState {
  if (event.type === 'RESET') return INITIAL_MAINNET_ONBOARDING_STATE;

  switch (state.stage) {
    case 'choice':
      if (event.type === 'BEGIN_CREATE' || event.type === 'BEGIN_IMPORT') {
        return {
          ...INITIAL_MAINNET_ONBOARDING_STATE,
          flow: event.type === 'BEGIN_CREATE' ? 'create' : 'import',
          stage: 'responsibility',
        };
      }
      return state;
    case 'responsibility':
      if (event.type === 'BACK') return INITIAL_MAINNET_ONBOARDING_STATE;
      if (event.type !== 'ACCEPT_RESPONSIBILITY' || !state.flow) return state;
      return {
        ...state,
        responsibilityAccepted: true,
        stage: state.flow === 'create' ? 'recovery-display' : 'recovery-entry',
      };
    case 'recovery-display':
      if (event.type === 'BACK') return { ...state, stage: 'responsibility' };
      if (event.type === 'RECOVERY_MATERIAL_READY') return { ...state, stage: 'recovery-confirmation' };
      return state;
    case 'recovery-entry':
      if (event.type === 'BACK') return { ...state, stage: 'responsibility' };
      if (event.type === 'RECOVERY_MATERIAL_READY') return { ...state, recoveryVerified: true, stage: 'pin-setup' };
      return state;
    case 'recovery-confirmation':
      if (event.type === 'BACK') return { ...state, stage: 'recovery-display' };
      if (event.type === 'CONFIRM_RECOVERY') return { ...state, recoveryVerified: true, stage: 'pin-setup' };
      return state;
    case 'pin-setup':
      if (event.type === 'BACK') {
        return {
          ...state,
          recoveryVerified: false,
          stage: state.flow === 'create' ? 'recovery-confirmation' : 'recovery-entry',
        };
      }
      if (event.type === 'PIN_CONFIGURED' && state.responsibilityAccepted && state.recoveryVerified) {
        return { ...state, stage: 'ready' };
      }
      return state;
    case 'ready':
      return state;
  }
}
