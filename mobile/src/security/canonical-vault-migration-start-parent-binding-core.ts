import type { CanonicalVaultMigrationLocalSubmitEvent } from './canonical-vault-migration-local-submit-policy';
import type { CanonicalVaultMigrationStartEventResult } from './canonical-vault-migration-start-event-adapter';
import type { CanonicalVaultMigrationStartHarness } from './canonical-vault-migration-start-harness-core';
import type { CanonicalVaultMigrationStartViewState } from './canonical-vault-migration-start-view-controller';

type StartHarness = Pick<CanonicalVaultMigrationStartHarness, 'getState' | 'handle'>;

export class CanonicalVaultMigrationStartParentPublicationGate {
  #active = false;
  #generation = 0;
  #lifecycleGeneration = 0;

  activate(): void {
    this.#active = true;
    this.#generation += 1;
    this.#lifecycleGeneration += 1;
  }

  beginRequest(): () => boolean {
    const generation = ++this.#generation;
    return () => this.#active && this.#generation === generation;
  }

  captureLifecyclePublication(): () => boolean {
    const lifecycleGeneration = this.#lifecycleGeneration;
    return () => this.#active && this.#lifecycleGeneration === lifecycleGeneration;
  }

  dispose(): void {
    this.#active = false;
    this.#generation += 1;
    this.#lifecycleGeneration += 1;
  }
}

export async function bindCanonicalVaultMigrationStartParentEvent(
  harness: StartHarness,
  event: CanonicalVaultMigrationLocalSubmitEvent,
  publishState: (state: CanonicalVaultMigrationStartViewState) => void,
  now = Date.now(),
  canPublish: () => boolean = () => true,
): Promise<CanonicalVaultMigrationStartEventResult | null> {
  try {
    const result = await harness.handle(event, now);
    if (canPublish()) publishState(result.state);
    return result;
  } catch {
    if (canPublish()) publishState(harness.getState());
    return null;
  }
}
