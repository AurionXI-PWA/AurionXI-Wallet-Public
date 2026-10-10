import {
  planCanonicalVaultMigration,
  type CanonicalVaultMigrationSnapshot,
} from './canonical-vault-migration-policy';

export const CANONICAL_VAULT_MIGRATION_START_CONFIRMATION = 'OPTIMIZE WALLET STORAGE';
export const CANONICAL_VAULT_MIGRATION_START_AUTHORIZATION_MS = 60_000;

type CanonicalVaultMigrationStartScope = {
  candidateCreatedAt: string;
  candidatePublicAddress: `0x${string}`;
  replacementTransactionId: string;
};

export type CanonicalVaultMigrationStartAuthorization = {
  authorizationExpiresAt?: number;
  scope?: CanonicalVaultMigrationStartScope;
  stage: 'idle' | 'blocked' | 'awaiting-pin' | 'awaiting-confirmation' | 'authorized';
};

export type CanonicalVaultMigrationStartAuthorizationEvent =
  | { snapshot: CanonicalVaultMigrationSnapshot; type: 'BEGIN' }
  | { now: number; type: 'PIN_VERIFIED' }
  | { confirmation: string; now: number; type: 'CONFIRM' }
  | { now: number; type: 'CHECK_EXPIRY' }
  | { type: 'RESET' };

export const INITIAL_CANONICAL_VAULT_MIGRATION_START_AUTHORIZATION: CanonicalVaultMigrationStartAuthorization = {
  stage: 'idle',
};

function scopeFromEligibleSnapshot(
  snapshot: CanonicalVaultMigrationSnapshot,
): CanonicalVaultMigrationStartScope | null {
  const plan = planCanonicalVaultMigration(snapshot);
  if (
    plan.action !== 'record-intent' ||
    plan.state !== 'eligible' ||
    !snapshot.candidate ||
    !snapshot.replacementJournal
  ) return null;
  return {
    candidateCreatedAt: snapshot.candidate.createdAt,
    candidatePublicAddress: snapshot.candidate.publicAddress,
    replacementTransactionId: snapshot.replacementJournal.transactionId,
  };
}

function scopesMatch(
  left: CanonicalVaultMigrationStartScope,
  right: CanonicalVaultMigrationStartScope,
): boolean {
  return left.candidatePublicAddress.toLowerCase() === right.candidatePublicAddress.toLowerCase() &&
    left.candidateCreatedAt === right.candidateCreatedAt &&
    left.replacementTransactionId === right.replacementTransactionId;
}

export function transitionCanonicalVaultMigrationStartAuthorization(
  state: CanonicalVaultMigrationStartAuthorization,
  event: CanonicalVaultMigrationStartAuthorizationEvent,
): CanonicalVaultMigrationStartAuthorization {
  if (event.type === 'RESET') return INITIAL_CANONICAL_VAULT_MIGRATION_START_AUTHORIZATION;
  if (event.type === 'BEGIN') {
    const scope = scopeFromEligibleSnapshot(event.snapshot);
    return scope ? { scope, stage: 'awaiting-pin' } : { stage: 'blocked' };
  }
  if (event.type === 'CHECK_EXPIRY') {
    return state.authorizationExpiresAt !== undefined && event.now >= state.authorizationExpiresAt
      ? INITIAL_CANONICAL_VAULT_MIGRATION_START_AUTHORIZATION
      : state;
  }
  if (state.stage === 'awaiting-pin' && event.type === 'PIN_VERIFIED') {
    return {
      ...state,
      authorizationExpiresAt: event.now + CANONICAL_VAULT_MIGRATION_START_AUTHORIZATION_MS,
      stage: 'awaiting-confirmation',
    };
  }
  if (state.stage === 'awaiting-confirmation' && event.type === 'CONFIRM') {
    if (state.authorizationExpiresAt === undefined || event.now >= state.authorizationExpiresAt) {
      return INITIAL_CANONICAL_VAULT_MIGRATION_START_AUTHORIZATION;
    }
    return event.confirmation === CANONICAL_VAULT_MIGRATION_START_CONFIRMATION
      ? { ...state, stage: 'authorized' }
      : state;
  }
  return state;
}

export function canStartCanonicalVaultMigration(
  authorization: CanonicalVaultMigrationStartAuthorization,
  freshSnapshot: CanonicalVaultMigrationSnapshot,
  now: number,
): boolean {
  const freshScope = scopeFromEligibleSnapshot(freshSnapshot);
  return authorization.stage === 'authorized' &&
    authorization.authorizationExpiresAt !== undefined &&
    now < authorization.authorizationExpiresAt &&
    !!authorization.scope &&
    !!freshScope &&
    scopesMatch(authorization.scope, freshScope);
}

