import { CANONICAL_VAULT_MIGRATION_START_CONFIRMATION } from './canonical-vault-migration-start-authorization';
import { normalizeCanonicalVaultMigrationStartInput } from './canonical-vault-migration-start-screen-core';
import type { CanonicalVaultMigrationStartViewState } from './canonical-vault-migration-start-view-controller';

export type CanonicalVaultMigrationInputEnablement = {
  action: 'none' | 'verify-pin' | 'confirm-authorization' | 'submit-authorized-start';
  editable: boolean;
  locallyEligible: boolean;
  normalizedValue: string;
};

export function getCanonicalVaultMigrationInputEnablement(
  state: CanonicalVaultMigrationStartViewState,
  value: string,
): CanonicalVaultMigrationInputEnablement {
  const { screen } = state;
  const normalizedValue = normalizeCanonicalVaultMigrationStartInput(screen.input, value);
  const action = screen.primaryAction;
  if (state.busy || action === 'none') {
    return { action, editable: false, locallyEligible: false, normalizedValue };
  }
  if (action === 'verify-pin') {
    return {
      action,
      editable: screen.input === 'pin',
      locallyEligible: screen.input === 'pin' && normalizedValue.length === 6,
      normalizedValue,
    };
  }
  if (action === 'confirm-authorization') {
    return {
      action,
      editable: screen.input === 'confirmation',
      locallyEligible: screen.input === 'confirmation' &&
        normalizedValue === CANONICAL_VAULT_MIGRATION_START_CONFIRMATION,
      normalizedValue,
    };
  }
  return {
    action,
    editable: false,
    locallyEligible: screen.input === 'none',
    normalizedValue: '',
  };
}

