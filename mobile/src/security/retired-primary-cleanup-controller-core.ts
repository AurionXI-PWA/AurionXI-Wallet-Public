import {
  INITIAL_RETIRED_PRIMARY_CLEANUP_AUTHORIZATION,
  transitionRetiredPrimaryCleanupAuthorization,
  type RetiredPrimaryCleanupAuthorization,
} from './retired-primary-cleanup-authorization';
import type { RetiredPrimaryCleanupPlan } from './retired-primary-cleanup-policy';

export type RetiredPrimaryCleanupControllerDependencies = {
  authenticatePin: (pin: string) => Promise<void>;
};

export class RetiredPrimaryCleanupController {
  #authenticationActive = false;
  #dependencies: RetiredPrimaryCleanupControllerDependencies;
  #state: RetiredPrimaryCleanupAuthorization = INITIAL_RETIRED_PRIMARY_CLEANUP_AUTHORIZATION;

  constructor(dependencies: RetiredPrimaryCleanupControllerDependencies) {
    this.#dependencies = dependencies;
  }

  getState(): RetiredPrimaryCleanupAuthorization {
    return this.#state;
  }

  begin(plan: RetiredPrimaryCleanupPlan): RetiredPrimaryCleanupAuthorization {
    if (this.#authenticationActive) throw new Error('Retired primary cleanup authentication is already active.');
    this.#state = transitionRetiredPrimaryCleanupAuthorization(this.#state, { plan, type: 'BEGIN' });
    return this.#state;
  }

  async authenticatePin(pin: string, now = Date.now()): Promise<RetiredPrimaryCleanupAuthorization> {
    if (this.#state.stage !== 'awaiting-pin') {
      throw new Error('PIN authentication is not allowed for retired primary cleanup.');
    }
    if (this.#authenticationActive) throw new Error('Retired primary cleanup authentication is already active.');
    const stateAtStart = this.#state;
    this.#authenticationActive = true;
    try {
      await this.#dependencies.authenticatePin(pin);
      if (this.#state !== stateAtStart) {
        throw new Error('Retired primary cleanup authorization changed during authentication.');
      }
      this.#state = transitionRetiredPrimaryCleanupAuthorization(this.#state, {
        now,
        type: 'PIN_VERIFIED',
      });
      return this.#state;
    } finally {
      this.#authenticationActive = false;
    }
  }

  confirm(confirmation: string, now = Date.now()): RetiredPrimaryCleanupAuthorization {
    this.#state = transitionRetiredPrimaryCleanupAuthorization(this.#state, {
      confirmation,
      now,
      type: 'CONFIRM',
    });
    return this.#state;
  }

  reset(): void {
    this.#state = INITIAL_RETIRED_PRIMARY_CLEANUP_AUTHORIZATION;
  }
}
