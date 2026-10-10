import type { CanonicalVaultMigrationSnapshot } from './canonical-vault-migration-policy';
import {
  INITIAL_CANONICAL_VAULT_MIGRATION_START_AUTHORIZATION,
  transitionCanonicalVaultMigrationStartAuthorization,
  type CanonicalVaultMigrationStartAuthorization,
} from './canonical-vault-migration-start-authorization';

export type CanonicalVaultMigrationStartControllerDependencies = {
  authenticatePin: (pin: string, signal: AbortSignal) => Promise<void>;
};

function authenticateWithAbort(
  authentication: Promise<void>,
  signal: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const rejectCancelled = () => reject(new Error('PIN authentication was cancelled.'));
    if (signal.aborted) {
      rejectCancelled();
      return;
    }
    signal.addEventListener('abort', rejectCancelled, { once: true });
    authentication.then(
      () => {
        signal.removeEventListener('abort', rejectCancelled);
        resolve();
      },
      (error) => {
        signal.removeEventListener('abort', rejectCancelled);
        reject(error);
      },
    );
  });
}

export class CanonicalVaultMigrationStartController {
  #authenticationActive = false;
  #authenticationAbortController: AbortController | null = null;
  #dependencies: CanonicalVaultMigrationStartControllerDependencies;
  #state: CanonicalVaultMigrationStartAuthorization = INITIAL_CANONICAL_VAULT_MIGRATION_START_AUTHORIZATION;

  constructor(dependencies: CanonicalVaultMigrationStartControllerDependencies) {
    this.#dependencies = dependencies;
  }

  getState(): CanonicalVaultMigrationStartAuthorization {
    return this.#state;
  }

  begin(snapshot: CanonicalVaultMigrationSnapshot): CanonicalVaultMigrationStartAuthorization {
    if (this.#authenticationActive) {
      throw new Error('Canonical migration PIN authentication is already active.');
    }
    this.#state = transitionCanonicalVaultMigrationStartAuthorization(this.#state, {
      snapshot,
      type: 'BEGIN',
    });
    return this.#state;
  }

  async authenticatePin(
    pin: string,
    now = Date.now(),
  ): Promise<CanonicalVaultMigrationStartAuthorization> {
    if (this.#state.stage !== 'awaiting-pin') {
      throw new Error('PIN authentication is not allowed for canonical migration start.');
    }
    if (this.#authenticationActive) {
      throw new Error('Canonical migration PIN authentication is already active.');
    }
    const stateAtStart = this.#state;
    const abortController = new AbortController();
    this.#authenticationActive = true;
    this.#authenticationAbortController = abortController;
    try {
      await authenticateWithAbort(
        Promise.resolve(this.#dependencies.authenticatePin(pin, abortController.signal)),
        abortController.signal,
      );
      if (this.#state !== stateAtStart) {
        throw new Error('Canonical migration authorization changed during authentication.');
      }
      this.#state = transitionCanonicalVaultMigrationStartAuthorization(this.#state, {
        now,
        type: 'PIN_VERIFIED',
      });
      return this.#state;
    } finally {
      if (this.#authenticationAbortController === abortController) {
        this.#authenticationAbortController = null;
        this.#authenticationActive = false;
      }
    }
  }

  confirm(confirmation: string, now = Date.now()): CanonicalVaultMigrationStartAuthorization {
    this.#state = transitionCanonicalVaultMigrationStartAuthorization(this.#state, {
      confirmation,
      now,
      type: 'CONFIRM',
    });
    return this.#state;
  }

  checkExpiry(now = Date.now()): CanonicalVaultMigrationStartAuthorization {
    this.#state = transitionCanonicalVaultMigrationStartAuthorization(this.#state, {
      now,
      type: 'CHECK_EXPIRY',
    });
    return this.#state;
  }

  reset(): void {
    this.#authenticationAbortController?.abort();
    this.#authenticationAbortController = null;
    this.#authenticationActive = false;
    this.#state = INITIAL_CANONICAL_VAULT_MIGRATION_START_AUTHORIZATION;
  }
}
