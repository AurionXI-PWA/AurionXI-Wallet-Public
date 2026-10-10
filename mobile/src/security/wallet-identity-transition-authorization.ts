import type {
  WalletIdentityTransitionPlan,
  WalletIdentityTransitionScope,
} from './wallet-identity-transition-policy';

export const WALLET_IDENTITY_TRANSITION_CONFIRMATION = 'UPDATE IDENTITY';
export const WALLET_IDENTITY_TRANSITION_AUTHORIZATION_MS = 60_000;

export type WalletIdentityTransitionAuthorization = {
  authorizationExpiresAt?: number;
  scope?: WalletIdentityTransitionScope;
  stage: 'idle' | 'blocked' | 'awaiting-pin' | 'awaiting-confirmation' | 'authorized';
};

export type WalletIdentityTransitionAuthorizationEvent =
  | { plan: WalletIdentityTransitionPlan; type: 'BEGIN' }
  | { now: number; type: 'PIN_VERIFIED' }
  | { confirmation: string; now: number; type: 'CONFIRM' }
  | { now: number; type: 'CHECK_EXPIRY' }
  | { type: 'RESET' };

export const INITIAL_WALLET_IDENTITY_TRANSITION_AUTHORIZATION: WalletIdentityTransitionAuthorization = {
  stage: 'idle',
};

function identityMatchesScope(
  left: WalletIdentityTransitionScope,
  right: WalletIdentityTransitionScope,
): boolean {
  return left.replacementTransactionId === right.replacementTransactionId &&
    left.previousIdentity.publicAddress.toLowerCase() === right.previousIdentity.publicAddress.toLowerCase() &&
    left.previousIdentity.vaultCreatedAt === right.previousIdentity.vaultCreatedAt &&
    left.nextIdentity.publicAddress.toLowerCase() === right.nextIdentity.publicAddress.toLowerCase() &&
    left.nextIdentity.vaultCreatedAt === right.nextIdentity.vaultCreatedAt;
}

export function transitionWalletIdentityAuthorization(
  state: WalletIdentityTransitionAuthorization,
  event: WalletIdentityTransitionAuthorizationEvent,
): WalletIdentityTransitionAuthorization {
  if (event.type === 'RESET') return INITIAL_WALLET_IDENTITY_TRANSITION_AUTHORIZATION;
  if (event.type === 'BEGIN') {
    return event.plan.action === 'require-authenticated-transition'
      ? { scope: event.plan.scope, stage: 'awaiting-pin' }
      : { stage: 'blocked' };
  }
  if (event.type === 'CHECK_EXPIRY') {
    return state.authorizationExpiresAt !== undefined && event.now >= state.authorizationExpiresAt
      ? INITIAL_WALLET_IDENTITY_TRANSITION_AUTHORIZATION
      : state;
  }
  if (state.stage === 'awaiting-pin' && event.type === 'PIN_VERIFIED') {
    return {
      ...state,
      authorizationExpiresAt: event.now + WALLET_IDENTITY_TRANSITION_AUTHORIZATION_MS,
      stage: 'awaiting-confirmation',
    };
  }
  if (state.stage === 'awaiting-confirmation' && event.type === 'CONFIRM') {
    if (state.authorizationExpiresAt === undefined || event.now >= state.authorizationExpiresAt) {
      return INITIAL_WALLET_IDENTITY_TRANSITION_AUTHORIZATION;
    }
    return event.confirmation === WALLET_IDENTITY_TRANSITION_CONFIRMATION
      ? { ...state, stage: 'authorized' }
      : state;
  }
  return state;
}

export function canExecuteWalletIdentityTransition(
  authorization: WalletIdentityTransitionAuthorization,
  freshPlan: WalletIdentityTransitionPlan,
  now: number,
): boolean {
  return authorization.stage === 'authorized' &&
    authorization.authorizationExpiresAt !== undefined &&
    now < authorization.authorizationExpiresAt &&
    !!authorization.scope &&
    freshPlan.action === 'require-authenticated-transition' &&
    identityMatchesScope(authorization.scope, freshPlan.scope);
}
