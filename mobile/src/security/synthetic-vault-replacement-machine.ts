export type SyntheticVaultReplacementStage =
  | 'idle'
  | 'awaiting-current-pin'
  | 'awaiting-new-recovery'
  | 'awaiting-recovery-confirmation'
  | 'awaiting-new-pin'
  | 'awaiting-final-confirmation'
  | 'authorized';

export type SyntheticVaultReplacementState = {
  authorizationExpiresAt?: number;
  stage: SyntheticVaultReplacementStage;
};

export type SyntheticVaultReplacementEvent =
  | { type: 'BEGIN' }
  | { type: 'CURRENT_SYNTHETIC_PIN_VERIFIED' }
  | { type: 'NEW_RECOVERY_GENERATED' }
  | { type: 'NEW_RECOVERY_CONFIRMED' }
  | { type: 'NEW_PIN_VERIFIED' }
  | { type: 'FINAL_CONFIRMATION'; now: number }
  | { type: 'EXPIRE'; now: number }
  | { type: 'RESET' };

export const SYNTHETIC_VAULT_REPLACEMENT_AUTHORIZATION_MS = 60_000;
export const INITIAL_SYNTHETIC_VAULT_REPLACEMENT_STATE: SyntheticVaultReplacementState = { stage: 'idle' };

export function transitionSyntheticVaultReplacement(
  state: SyntheticVaultReplacementState,
  event: SyntheticVaultReplacementEvent,
): SyntheticVaultReplacementState {
  if (event.type === 'RESET') return INITIAL_SYNTHETIC_VAULT_REPLACEMENT_STATE;
  if (event.type === 'EXPIRE') {
    return state.authorizationExpiresAt !== undefined && event.now >= state.authorizationExpiresAt
      ? INITIAL_SYNTHETIC_VAULT_REPLACEMENT_STATE
      : state;
  }
  if (state.stage === 'idle' && event.type === 'BEGIN') return { stage: 'awaiting-current-pin' };
  if (state.stage === 'awaiting-current-pin' && event.type === 'CURRENT_SYNTHETIC_PIN_VERIFIED') return { stage: 'awaiting-new-recovery' };
  if (state.stage === 'awaiting-new-recovery' && event.type === 'NEW_RECOVERY_GENERATED') return { stage: 'awaiting-recovery-confirmation' };
  if (state.stage === 'awaiting-recovery-confirmation' && event.type === 'NEW_RECOVERY_CONFIRMED') return { stage: 'awaiting-new-pin' };
  if (state.stage === 'awaiting-new-pin' && event.type === 'NEW_PIN_VERIFIED') return { stage: 'awaiting-final-confirmation' };
  if (state.stage === 'awaiting-final-confirmation' && event.type === 'FINAL_CONFIRMATION') {
    return { authorizationExpiresAt: event.now + SYNTHETIC_VAULT_REPLACEMENT_AUTHORIZATION_MS, stage: 'authorized' };
  }
  return state;
}

export function canExecuteSyntheticVaultReplacement(state: SyntheticVaultReplacementState, now: number): boolean {
  return state.stage === 'authorized' && state.authorizationExpiresAt !== undefined && now < state.authorizationExpiresAt;
}
