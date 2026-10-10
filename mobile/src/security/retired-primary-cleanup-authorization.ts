import type { RetiredPrimaryCleanupPlan, RetiredPrimaryCleanupScope } from './retired-primary-cleanup-policy';

export const RETIRED_PRIMARY_CLEANUP_CONFIRMATION = 'REMOVE RETIRED WALLET';
export const RETIRED_PRIMARY_CLEANUP_AUTHORIZATION_MS = 60_000;

export type RetiredPrimaryCleanupAuthorization = {
  authorizationExpiresAt?: number;
  scope?: RetiredPrimaryCleanupScope;
  stage: 'idle' | 'blocked' | 'awaiting-pin' | 'awaiting-confirmation' | 'authorized';
};

export type RetiredPrimaryCleanupAuthorizationEvent =
  | { plan: RetiredPrimaryCleanupPlan; type: 'BEGIN' }
  | { now: number; type: 'PIN_VERIFIED' }
  | { confirmation: string; now: number; type: 'CONFIRM' }
  | { now: number; type: 'CHECK_EXPIRY' }
  | { type: 'RESET' };

export const INITIAL_RETIRED_PRIMARY_CLEANUP_AUTHORIZATION: RetiredPrimaryCleanupAuthorization = { stage: 'idle' };

function scopesMatch(left: RetiredPrimaryCleanupScope, right: RetiredPrimaryCleanupScope): boolean {
  return left.replacementTransactionId === right.replacementTransactionId &&
    left.retiredPrimaryStatus === right.retiredPrimaryStatus &&
    left.retiredIdentity.publicAddress.toLowerCase() === right.retiredIdentity.publicAddress.toLowerCase() &&
    left.retiredIdentity.vaultCreatedAt === right.retiredIdentity.vaultCreatedAt &&
    left.activeIdentity.publicAddress.toLowerCase() === right.activeIdentity.publicAddress.toLowerCase() &&
    left.activeIdentity.vaultCreatedAt === right.activeIdentity.vaultCreatedAt;
}

export function transitionRetiredPrimaryCleanupAuthorization(
  state: RetiredPrimaryCleanupAuthorization,
  event: RetiredPrimaryCleanupAuthorizationEvent,
): RetiredPrimaryCleanupAuthorization {
  if (event.type === 'RESET') return INITIAL_RETIRED_PRIMARY_CLEANUP_AUTHORIZATION;
  if (event.type === 'BEGIN') {
    return event.plan.action === 'require-authenticated-cleanup'
      ? { scope: event.plan.scope, stage: 'awaiting-pin' }
      : { stage: 'blocked' };
  }
  if (event.type === 'CHECK_EXPIRY') {
    return state.authorizationExpiresAt !== undefined && event.now >= state.authorizationExpiresAt
      ? INITIAL_RETIRED_PRIMARY_CLEANUP_AUTHORIZATION
      : state;
  }
  if (state.stage === 'awaiting-pin' && event.type === 'PIN_VERIFIED') {
    return { ...state, authorizationExpiresAt: event.now + RETIRED_PRIMARY_CLEANUP_AUTHORIZATION_MS, stage: 'awaiting-confirmation' };
  }
  if (state.stage === 'awaiting-confirmation' && event.type === 'CONFIRM') {
    if (state.authorizationExpiresAt === undefined || event.now >= state.authorizationExpiresAt) {
      return INITIAL_RETIRED_PRIMARY_CLEANUP_AUTHORIZATION;
    }
    return event.confirmation === RETIRED_PRIMARY_CLEANUP_CONFIRMATION
      ? { ...state, stage: 'authorized' }
      : state;
  }
  return state;
}

export function canCreateRetiredPrimaryCleanupIntent(
  authorization: RetiredPrimaryCleanupAuthorization,
  freshPlan: RetiredPrimaryCleanupPlan,
  now: number,
): boolean {
  return authorization.stage === 'authorized' &&
    authorization.authorizationExpiresAt !== undefined && now < authorization.authorizationExpiresAt &&
    !!authorization.scope && freshPlan.action === 'require-authenticated-cleanup' &&
    scopesMatch(authorization.scope, freshPlan.scope);
}
