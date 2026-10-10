export type WalletFlow = 'create' | 'import';

export type WalletOnboardingStage =
  | 'choice'
  | 'responsibility'
  | 'recovery-display'
  | 'recovery-entry'
  | 'recovery-confirmation'
  | 'pin-setup'
  | 'ready';

export type WalletOnboardingState = {
  stage: WalletOnboardingStage;
  flow?: WalletFlow;
  responsibilityAccepted: boolean;
  recoveryVerified: boolean;
};

export type WalletOnboardingEvent =
  | { type: 'BEGIN_CREATE' }
  | { type: 'BEGIN_IMPORT' }
  | { type: 'ACCEPT_RESPONSIBILITY' }
  | { type: 'RECOVERY_MATERIAL_READY' }
  | { type: 'CONFIRM_RECOVERY' }
  | { type: 'PIN_CONFIGURED' }
  | { type: 'BACK' }
  | { type: 'RESET' };

export const INITIAL_ONBOARDING_STATE: WalletOnboardingState = {
  stage: 'choice',
  responsibilityAccepted: false,
  recoveryVerified: false,
};

export type WalletOnboardingRoute = 'responsibility' | 'recovery' | 'pin-setup';

export function canAccessWalletOnboardingRoute(
  state: WalletOnboardingState,
  route: WalletOnboardingRoute,
): boolean {
  if (route === 'responsibility') return state.stage === 'responsibility' && !!state.flow;
  if (route === 'recovery') {
    return !!state.flow && state.responsibilityAccepted && (
      state.stage === 'recovery-display' ||
      state.stage === 'recovery-entry' ||
      state.stage === 'recovery-confirmation'
    );
  }
  return !!state.flow && state.responsibilityAccepted && state.recoveryVerified && (
    state.stage === 'pin-setup' || state.stage === 'ready'
  );
}

export function transitionWalletOnboarding(
  state: WalletOnboardingState,
  event: WalletOnboardingEvent,
): WalletOnboardingState {
  if (event.type === 'RESET') return INITIAL_ONBOARDING_STATE;

  switch (state.stage) {
    case 'choice':
      if (event.type === 'BEGIN_CREATE' || event.type === 'BEGIN_IMPORT') {
        return {
          ...INITIAL_ONBOARDING_STATE,
          flow: event.type === 'BEGIN_CREATE' ? 'create' : 'import',
          stage: 'responsibility',
        };
      }
      return state;
    case 'responsibility':
      if (event.type === 'BACK') return INITIAL_ONBOARDING_STATE;
      if (event.type !== 'ACCEPT_RESPONSIBILITY' || !state.flow) return state;
      return {
        ...state,
        responsibilityAccepted: true,
        stage: state.flow === 'create' ? 'recovery-display' : 'recovery-entry',
      };
    case 'recovery-display':
      if (event.type === 'BACK') return { ...state, stage: 'responsibility' };
      if (event.type === 'RECOVERY_MATERIAL_READY') {
        return { ...state, stage: 'recovery-confirmation' };
      }
      return state;
    case 'recovery-entry':
      if (event.type === 'BACK') return { ...state, stage: 'responsibility' };
      if (event.type === 'RECOVERY_MATERIAL_READY') {
        return { ...state, recoveryVerified: true, stage: 'pin-setup' };
      }
      return state;
    case 'recovery-confirmation':
      if (event.type === 'BACK') return { ...state, stage: 'recovery-display' };
      if (event.type === 'CONFIRM_RECOVERY') {
        return { ...state, recoveryVerified: true, stage: 'pin-setup' };
      }
      return state;
    case 'pin-setup':
      if (event.type === 'BACK') {
        return {
          ...state,
          recoveryVerified: false,
          stage: state.flow === 'create' ? 'recovery-confirmation' : 'recovery-entry',
        };
      }
      if (
        event.type === 'PIN_CONFIGURED' &&
        state.responsibilityAccepted &&
        state.recoveryVerified
      ) {
        return { ...state, stage: 'ready' };
      }
      return state;
    case 'ready':
      return state;
  }
}
