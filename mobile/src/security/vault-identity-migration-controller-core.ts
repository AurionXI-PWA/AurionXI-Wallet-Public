import type { VaultV3Envelope } from './vault-envelope-v3';
import type { VaultIdentityIntegrityAudit } from './vault-identity-integrity-core';
import {
  canWriteMigratedWalletIdentity,
  INITIAL_VAULT_IDENTITY_MIGRATION_STATE,
  transitionVaultIdentityMigration,
  type VaultIdentityMigrationState,
} from './vault-identity-migration-policy';

export type VaultIdentityMigrationControllerDependencies = {
  authenticatePin: (pin: string) => Promise<void>;
};

export class VaultIdentityMigrationController {
  #authenticationActive = false;
  #dependencies: VaultIdentityMigrationControllerDependencies;
  #state: VaultIdentityMigrationState = INITIAL_VAULT_IDENTITY_MIGRATION_STATE;

  constructor(dependencies: VaultIdentityMigrationControllerDependencies) {
    this.#dependencies = dependencies;
  }

  getState(): VaultIdentityMigrationState {
    return this.#state;
  }

  begin(audit: VaultIdentityIntegrityAudit, vault: VaultV3Envelope | null): VaultIdentityMigrationState {
    if (this.#authenticationActive) throw new Error('Identity migration authentication is already active.');
    this.#state = transitionVaultIdentityMigration(this.#state, { audit, type: 'BEGIN', vault });
    return this.#state;
  }

  async authenticatePin(pin: string, now = Date.now()): Promise<VaultIdentityMigrationState> {
    if (this.#state.stage !== 'awaiting-pin') {
      throw new Error('PIN authentication is not allowed for identity migration.');
    }
    if (this.#authenticationActive) throw new Error('Identity migration authentication is already active.');

    const stateAtStart = this.#state;
    this.#authenticationActive = true;
    try {
      await this.#dependencies.authenticatePin(pin);
      if (this.#state !== stateAtStart) {
        throw new Error('Identity migration authorization changed during authentication.');
      }
      this.#state = transitionVaultIdentityMigration(this.#state, { now, type: 'PIN_VERIFIED' });
      return this.#state;
    } finally {
      this.#authenticationActive = false;
    }
  }

  confirm(confirmation: string, now = Date.now()): VaultIdentityMigrationState {
    this.#state = transitionVaultIdentityMigration(this.#state, { confirmation, now, type: 'CONFIRM' });
    return this.#state;
  }

  checkExpiry(now = Date.now()): VaultIdentityMigrationState {
    this.#state = transitionVaultIdentityMigration(this.#state, { now, type: 'CHECK_EXPIRY' });
    return this.#state;
  }

  canWrite(
    audit: VaultIdentityIntegrityAudit,
    vault: VaultV3Envelope | null,
    now = Date.now(),
  ): boolean {
    return canWriteMigratedWalletIdentity(this.#state, audit, vault, now);
  }

  reset(): void {
    this.#state = INITIAL_VAULT_IDENTITY_MIGRATION_STATE;
  }
}
