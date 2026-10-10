import type { CanonicalVaultMigrationSnapshot } from './canonical-vault-migration-policy';
import type { CanonicalVaultMigrationStartController } from './canonical-vault-migration-start-controller-core';
import { getCanonicalVaultMigrationStartScreenModel } from './canonical-vault-migration-start-screen-core';
import { getCanonicalVaultMigrationStartUiModel } from './canonical-vault-migration-start-ui-model';

type StartAuthorizationController = Pick<
  CanonicalVaultMigrationStartController,
  'authenticatePin' | 'begin' | 'checkExpiry' | 'confirm' | 'getState' | 'reset'
>;

export type CanonicalVaultMigrationStartViewState = {
  busy: boolean;
  error: string | null;
  screen: ReturnType<typeof getCanonicalVaultMigrationStartScreenModel>;
};

export class CanonicalVaultMigrationStartViewController {
  #busy = false;
  #controller: StartAuthorizationController;
  #error: string | null = null;

  constructor(controller: StartAuthorizationController) {
    this.#controller = controller;
  }

  #viewState(): CanonicalVaultMigrationStartViewState {
    return {
      busy: this.#busy,
      error: this.#error,
      screen: getCanonicalVaultMigrationStartScreenModel(
        getCanonicalVaultMigrationStartUiModel(this.#controller.getState()),
      ),
    };
  }

  getState(): CanonicalVaultMigrationStartViewState {
    return this.#viewState();
  }

  begin(snapshot: CanonicalVaultMigrationSnapshot): CanonicalVaultMigrationStartViewState {
    this.#error = null;
    this.#controller.begin(snapshot);
    return this.#viewState();
  }

  async verifyPin(pin: string, now = Date.now()): Promise<CanonicalVaultMigrationStartViewState> {
    if (this.#busy) throw new Error('Canonical migration start view is busy.');
    this.#busy = true;
    this.#error = null;
    try {
      await this.#controller.authenticatePin(pin, now);
    } catch (error) {
      this.#error = 'PIN verification did not complete.';
      throw error;
    } finally {
      this.#busy = false;
    }
    return this.#viewState();
  }

  confirm(confirmation: string, now = Date.now()): CanonicalVaultMigrationStartViewState {
    this.#error = null;
    const state = this.#controller.confirm(confirmation, now);
    if (state.stage === 'awaiting-confirmation') {
      this.#error = 'Type the confirmation phrase exactly as shown.';
    }
    return this.#viewState();
  }

  checkExpiry(now = Date.now()): CanonicalVaultMigrationStartViewState {
    this.#controller.checkExpiry(now);
    return this.#viewState();
  }

  reset(): CanonicalVaultMigrationStartViewState {
    this.#controller.reset();
    this.#busy = false;
    this.#error = null;
    return this.#viewState();
  }
}
