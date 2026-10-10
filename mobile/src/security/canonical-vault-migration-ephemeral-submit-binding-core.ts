import {
  createCanonicalVaultMigrationLocalSubmitEvent,
  type CanonicalVaultMigrationLocalSubmitEvent,
} from './canonical-vault-migration-local-submit-policy';
import type { CanonicalVaultMigrationStartViewState } from './canonical-vault-migration-start-view-controller';

export type CanonicalVaultMigrationEphemeralSubmitResult = {
  dispatched: boolean;
  nextValue: string;
};

export function dispatchCanonicalVaultMigrationEphemeralSubmit(
  state: CanonicalVaultMigrationStartViewState,
  value: string,
  emit: (event: CanonicalVaultMigrationLocalSubmitEvent) => void,
): CanonicalVaultMigrationEphemeralSubmitResult {
  const event = createCanonicalVaultMigrationLocalSubmitEvent(state, value);
  if (!event) return { dispatched: false, nextValue: value };
  emit(event);
  return { dispatched: true, nextValue: '' };
}

