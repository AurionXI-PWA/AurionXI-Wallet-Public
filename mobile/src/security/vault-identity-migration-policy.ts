import type { VaultV3Envelope } from './vault-envelope-v3';
import type { VaultIdentityIntegrityAudit } from './vault-identity-integrity-core';

export const VAULT_IDENTITY_MIGRATION_CONFIRMATION = 'MIGRATE';
export const VAULT_IDENTITY_MIGRATION_AUTHORIZATION_MS = 60_000;

type VaultIdentityMigrationScope = {
  publicAddress: `0x${string}`;
  vaultCreatedAt: string;
};

export type VaultIdentityMigrationState = {
  authorizationExpiresAt?: number;
  scope?: VaultIdentityMigrationScope;
  stage: 'idle' | 'blocked' | 'awaiting-pin' | 'awaiting-confirmation' | 'authorized';
};

export type VaultIdentityMigrationEvent =
  | { audit: VaultIdentityIntegrityAudit; type: 'BEGIN'; vault: VaultV3Envelope | null }
  | { now: number; type: 'PIN_VERIFIED' }
  | { confirmation: string; now: number; type: 'CONFIRM' }
  | { now: number; type: 'CHECK_EXPIRY' }
  | { type: 'RESET' };

export const INITIAL_VAULT_IDENTITY_MIGRATION_STATE: VaultIdentityMigrationState = { stage: 'idle' };

function scopeMatchesVault(scope: VaultIdentityMigrationScope, vault: VaultV3Envelope): boolean {
  return scope.vaultCreatedAt === vault.createdAt &&
    scope.publicAddress.toLowerCase() === vault.publicAddress.toLowerCase();
}

export function transitionVaultIdentityMigration(
  state: VaultIdentityMigrationState,
  event: VaultIdentityMigrationEvent,
): VaultIdentityMigrationState {
  if (event.type === 'RESET') return INITIAL_VAULT_IDENTITY_MIGRATION_STATE;
  if (event.type === 'BEGIN') {
    if (
      event.audit.state !== 'missing-identity' ||
      event.audit.action !== 'require-pin-migration' ||
      !event.vault
    ) {
      return { stage: 'blocked' };
    }
    return {
      scope: {
        publicAddress: event.vault.publicAddress,
        vaultCreatedAt: event.vault.createdAt,
      },
      stage: 'awaiting-pin',
    };
  }
  if (event.type === 'CHECK_EXPIRY') {
    if (state.authorizationExpiresAt !== undefined && event.now >= state.authorizationExpiresAt) {
      return INITIAL_VAULT_IDENTITY_MIGRATION_STATE;
    }
    return state;
  }
  if (state.stage === 'awaiting-pin' && event.type === 'PIN_VERIFIED') {
    return {
      ...state,
      authorizationExpiresAt: event.now + VAULT_IDENTITY_MIGRATION_AUTHORIZATION_MS,
      stage: 'awaiting-confirmation',
    };
  }
  if (state.stage === 'awaiting-confirmation' && event.type === 'CONFIRM') {
    if (state.authorizationExpiresAt === undefined || event.now >= state.authorizationExpiresAt) {
      return INITIAL_VAULT_IDENTITY_MIGRATION_STATE;
    }
    if (event.confirmation !== VAULT_IDENTITY_MIGRATION_CONFIRMATION) return state;
    return { ...state, stage: 'authorized' };
  }
  return state;
}

export function canWriteMigratedWalletIdentity(
  state: VaultIdentityMigrationState,
  audit: VaultIdentityIntegrityAudit,
  vault: VaultV3Envelope | null,
  now: number,
): boolean {
  return state.stage === 'authorized' &&
    state.authorizationExpiresAt !== undefined &&
    now < state.authorizationExpiresAt &&
    audit.state === 'missing-identity' &&
    audit.action === 'require-pin-migration' &&
    !!state.scope &&
    !!vault &&
    scopeMatchesVault(state.scope, vault);
}
