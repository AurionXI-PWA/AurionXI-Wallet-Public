import type { VaultStatus } from './vault-store';

export const VAULT_REPLACEMENT_CONFIRMATION = 'REPLACE';
export const VAULT_REPLACEMENT_AUTHORIZATION_MS = 60_000;

export type VaultReplacementState = {
  authorizationExpiresAt?: number;
  requiredAuthentication?: 'pin' | 'recovery';
  stage: 'idle' | 'blocked' | 'awaiting-authentication' | 'awaiting-confirmation' | 'authorized';
  targetStatus?: 'present' | 'corrupt';
};

export type VaultReplacementEvent =
  | { type: 'BEGIN'; status: VaultStatus }
  | { type: 'PIN_VERIFIED'; now: number }
  | { type: 'RECOVERY_VERIFIED'; now: number }
  | { type: 'CONFIRM'; confirmation: string; now: number }
  | { type: 'CHECK_EXPIRY'; now: number }
  | { type: 'RESET' };

export const INITIAL_VAULT_REPLACEMENT_STATE: VaultReplacementState = { stage: 'idle' };

export function transitionVaultReplacement(
  state: VaultReplacementState,
  event: VaultReplacementEvent,
): VaultReplacementState {
  if (event.type === 'RESET') return INITIAL_VAULT_REPLACEMENT_STATE;
  if (event.type === 'BEGIN') {
    if (event.status === 'present') {
      return { stage: 'awaiting-authentication', targetStatus: 'present', requiredAuthentication: 'pin' };
    }
    if (event.status === 'corrupt') {
      return { stage: 'awaiting-authentication', targetStatus: 'corrupt', requiredAuthentication: 'recovery' };
    }
    return { stage: 'blocked' };
  }
  if (event.type === 'CHECK_EXPIRY') {
    if (state.authorizationExpiresAt !== undefined && event.now >= state.authorizationExpiresAt) {
      return INITIAL_VAULT_REPLACEMENT_STATE;
    }
    return state;
  }
  if (state.stage === 'awaiting-authentication') {
    const correctAuthentication =
      (state.requiredAuthentication === 'pin' && event.type === 'PIN_VERIFIED') ||
      (state.requiredAuthentication === 'recovery' && event.type === 'RECOVERY_VERIFIED');
    if (!correctAuthentication) return state;
    return {
      ...state,
      authorizationExpiresAt: event.now + VAULT_REPLACEMENT_AUTHORIZATION_MS,
      stage: 'awaiting-confirmation',
    };
  }
  if (state.stage === 'awaiting-confirmation' && event.type === 'CONFIRM') {
    if (
      state.authorizationExpiresAt === undefined ||
      event.now >= state.authorizationExpiresAt ||
      event.confirmation !== VAULT_REPLACEMENT_CONFIRMATION
    ) {
      return event.now >= (state.authorizationExpiresAt ?? 0)
        ? INITIAL_VAULT_REPLACEMENT_STATE
        : state;
    }
    return { ...state, stage: 'authorized' };
  }
  return state;
}

export function canExecuteVaultReplacement(state: VaultReplacementState, now: number): boolean {
  return state.stage === 'authorized' &&
    state.authorizationExpiresAt !== undefined &&
    now < state.authorizationExpiresAt;
}
