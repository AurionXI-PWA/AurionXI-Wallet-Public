import { getCanonicalVaultMigrationInputEnablement } from './canonical-vault-migration-input-enablement-policy';
import type { CanonicalVaultMigrationStartViewState } from './canonical-vault-migration-start-view-controller';

export type CanonicalVaultMigrationLocalSubmitEvent =
  | { pin: string; type: 'VERIFY_PIN_REQUESTED' }
  | { confirmation: string; type: 'CONFIRM_AUTHORIZATION_REQUESTED' }
  | { type: 'AUTHORIZED_START_REQUESTED' };

export function createCanonicalVaultMigrationLocalSubmitEvent(
  state: CanonicalVaultMigrationStartViewState,
  value: string,
): CanonicalVaultMigrationLocalSubmitEvent | null {
  const enablement = getCanonicalVaultMigrationInputEnablement(state, value);
  if (!enablement.locallyEligible) return null;
  if (enablement.action === 'verify-pin') {
    return { pin: enablement.normalizedValue, type: 'VERIFY_PIN_REQUESTED' };
  }
  if (enablement.action === 'confirm-authorization') {
    return {
      confirmation: enablement.normalizedValue,
      type: 'CONFIRM_AUTHORIZATION_REQUESTED',
    };
  }
  if (enablement.action === 'submit-authorized-start') {
    return { type: 'AUTHORIZED_START_REQUESTED' };
  }
  return null;
}

