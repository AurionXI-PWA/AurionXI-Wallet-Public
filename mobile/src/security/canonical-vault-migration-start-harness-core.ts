import type { CanonicalVaultMigrationLocalSubmitEvent } from './canonical-vault-migration-local-submit-policy';
import type { CanonicalVaultMigrationSnapshot } from './canonical-vault-migration-policy';
import { CanonicalVaultMigrationStartController } from './canonical-vault-migration-start-controller-core';
import {
  handleCanonicalVaultMigrationStartEvent,
  type CanonicalVaultMigrationStartEventResult,
} from './canonical-vault-migration-start-event-adapter';
import {
  CanonicalVaultMigrationStartViewController,
  type CanonicalVaultMigrationStartViewState,
} from './canonical-vault-migration-start-view-controller';

export type CanonicalVaultMigrationStartHarnessDependencies = {
  authenticatePin: (pin: string, signal: AbortSignal) => Promise<void>;
};

export class CanonicalVaultMigrationStartHarness {
  #authorizedStartReports = 0;
  #state: CanonicalVaultMigrationStartViewState;
  #viewController: CanonicalVaultMigrationStartViewController | null;

  constructor(dependencies: CanonicalVaultMigrationStartHarnessDependencies) {
    this.#viewController = new CanonicalVaultMigrationStartViewController(
      new CanonicalVaultMigrationStartController({ authenticatePin: dependencies.authenticatePin }),
    );
    this.#state = this.#viewController.getState();
  }

  #controller(): CanonicalVaultMigrationStartViewController {
    if (!this.#viewController) throw new Error('Canonical migration start harness is released.');
    return this.#viewController;
  }

  begin(snapshot: CanonicalVaultMigrationSnapshot): CanonicalVaultMigrationStartViewState {
    this.#state = this.#controller().begin(snapshot);
    return this.#state;
  }

  getAuthorizedStartReportCount(): number {
    return this.#authorizedStartReports;
  }

  getState(): CanonicalVaultMigrationStartViewState {
    return this.#state;
  }

  checkExpiry(now = Date.now()): CanonicalVaultMigrationStartViewState {
    this.#state = this.#controller().checkExpiry(now);
    return this.#state;
  }

  restart(snapshot: CanonicalVaultMigrationSnapshot): CanonicalVaultMigrationStartViewState {
    this.#controller().reset();
    this.#state = this.#controller().begin(snapshot);
    return this.#state;
  }

  release(): void {
    if (!this.#viewController) return;
    this.#state = this.#viewController.reset();
    this.#viewController = null;
    this.#authorizedStartReports = 0;
  }

  async handle(
    event: CanonicalVaultMigrationLocalSubmitEvent,
    now = Date.now(),
  ): Promise<CanonicalVaultMigrationStartEventResult> {
    try {
      const result = await handleCanonicalVaultMigrationStartEvent(this.#controller(), event, now);
      this.#state = result.state;
      if (result.action === 'authorized-start-reported') this.#authorizedStartReports += 1;
      return result;
    } catch (error) {
      this.#state = this.#controller().getState();
      throw error;
    }
  }
}
