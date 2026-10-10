import type { CanonicalVaultMigrationLocalSubmitEvent } from './canonical-vault-migration-local-submit-policy';
import type {
  CanonicalVaultMigrationStartViewController,
  CanonicalVaultMigrationStartViewState,
} from './canonical-vault-migration-start-view-controller';

type StartViewController = Pick<
  CanonicalVaultMigrationStartViewController,
  'confirm' | 'getState' | 'verifyPin'
>;

export type CanonicalVaultMigrationStartEventResult =
  | { action: 'view-state-updated'; state: CanonicalVaultMigrationStartViewState }
  | { action: 'authorized-start-reported'; state: CanonicalVaultMigrationStartViewState };

export async function handleCanonicalVaultMigrationStartEvent(
  controller: StartViewController,
  event: CanonicalVaultMigrationLocalSubmitEvent,
  now = Date.now(),
): Promise<CanonicalVaultMigrationStartEventResult> {
  if (event.type === 'VERIFY_PIN_REQUESTED') {
    return {
      action: 'view-state-updated',
      state: await controller.verifyPin(event.pin, now),
    };
  }
  if (event.type === 'CONFIRM_AUTHORIZATION_REQUESTED') {
    return {
      action: 'view-state-updated',
      state: controller.confirm(event.confirmation, now),
    };
  }
  return {
    action: 'authorized-start-reported',
    state: controller.getState(),
  };
}

