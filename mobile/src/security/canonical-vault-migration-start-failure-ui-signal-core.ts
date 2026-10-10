import type { CanonicalVaultMigrationStartViewState } from './canonical-vault-migration-start-view-controller';

export const CANONICAL_VAULT_MIGRATION_CALLBACK_FAILURE_MESSAGE =
  'Authorization status could not be refreshed. Verify wallet access again.';

export function getCanonicalVaultMigrationCallbackFailureViewState(
  currentState: CanonicalVaultMigrationStartViewState,
): CanonicalVaultMigrationStartViewState {
  return {
    ...currentState,
    busy: false,
    error: CANONICAL_VAULT_MIGRATION_CALLBACK_FAILURE_MESSAGE,
  };
}

export function recoverCanonicalVaultMigrationCallbackFailureViewState(
  restartAuthorization: () => CanonicalVaultMigrationStartViewState,
  fallbackState: CanonicalVaultMigrationStartViewState,
): CanonicalVaultMigrationStartViewState {
  try {
    return getCanonicalVaultMigrationCallbackFailureViewState(restartAuthorization());
  } catch {
    return getCanonicalVaultMigrationCallbackFailureViewState(fallbackState);
  }
}

export function getCanonicalVaultMigrationRetryStartedViewState(
  currentState: CanonicalVaultMigrationStartViewState,
  eventType: 'VERIFY_PIN_REQUESTED' | 'CONFIRM_AUTHORIZATION_REQUESTED' | 'AUTHORIZED_START_REQUESTED',
): CanonicalVaultMigrationStartViewState {
  if (eventType !== 'VERIFY_PIN_REQUESTED') return currentState;
  return {
    ...currentState,
    busy: true,
    error: null,
  };
}
