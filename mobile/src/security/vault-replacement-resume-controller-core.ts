import type {
  VaultReplacementJournal,
  VaultReplacementRecoveryAudit,
} from './vault-replacement-journal-core';
import {
  canResumeVaultReplacementCandidate,
  INITIAL_VAULT_REPLACEMENT_RESUME_STATE,
  transitionVaultReplacementResume,
  type VaultReplacementResumeState,
} from './vault-replacement-resume-policy';

export type VaultReplacementResumeScope = Readonly<{
  candidatePublicAddress: `0x${string}`;
  targetStatus: 'present' | 'corrupt';
  transactionId: string;
}>;

export type VaultReplacementResumeControllerDependencies = {
  authenticatePin: (pin: string) => Promise<void>;
  authenticateRecoveryOwnership: (
    recoveryPhrase: string,
    scope: VaultReplacementResumeScope,
  ) => Promise<void>;
};

export class VaultReplacementResumeController {
  #authenticationActive = false;
  #dependencies: VaultReplacementResumeControllerDependencies;
  #state: VaultReplacementResumeState = INITIAL_VAULT_REPLACEMENT_RESUME_STATE;

  constructor(dependencies: VaultReplacementResumeControllerDependencies) {
    this.#dependencies = dependencies;
  }

  getState(): VaultReplacementResumeState {
    return this.#state;
  }

  begin(audit: VaultReplacementRecoveryAudit, journal: VaultReplacementJournal | null): VaultReplacementResumeState {
    if (this.#authenticationActive) throw new Error('Resume authentication is already active.');
    this.#state = transitionVaultReplacementResume(this.#state, { audit, journal, type: 'BEGIN' });
    return this.#state;
  }

  async authenticatePin(pin: string, now = Date.now()): Promise<VaultReplacementResumeState> {
    return this.#authenticate('pin', pin, now);
  }

  async authenticateRecovery(
    recoveryPhrase: string,
    now = Date.now(),
  ): Promise<VaultReplacementResumeState> {
    return this.#authenticate('recovery', recoveryPhrase, now);
  }

  confirm(confirmation: string, now = Date.now()): VaultReplacementResumeState {
    this.#state = transitionVaultReplacementResume(this.#state, { confirmation, now, type: 'CONFIRM' });
    return this.#state;
  }

  checkExpiry(now = Date.now()): VaultReplacementResumeState {
    this.#state = transitionVaultReplacementResume(this.#state, { now, type: 'CHECK_EXPIRY' });
    return this.#state;
  }

  canResume(journal: VaultReplacementJournal | null, now = Date.now()): boolean {
    return canResumeVaultReplacementCandidate(this.#state, journal, now);
  }

  reset(): void {
    this.#state = INITIAL_VAULT_REPLACEMENT_RESUME_STATE;
  }

  async #authenticate(
    method: 'pin' | 'recovery',
    credential: string,
    now: number,
  ): Promise<VaultReplacementResumeState> {
    const stateAtStart = this.#state;
    const scopeAtStart = stateAtStart.scope;
    if (
      stateAtStart.stage !== 'awaiting-authentication' ||
      stateAtStart.requiredAuthentication !== method ||
      !scopeAtStart
    ) {
      throw new Error('The requested resume authentication method is not allowed.');
    }
    if (this.#authenticationActive) throw new Error('Resume authentication is already active.');

    this.#authenticationActive = true;
    try {
      if (method === 'pin') {
        await this.#dependencies.authenticatePin(credential);
      } else {
        await this.#dependencies.authenticateRecoveryOwnership(credential, scopeAtStart);
      }
      if (this.#state !== stateAtStart) {
        throw new Error('Resume authorization changed during authentication.');
      }
      this.#state = transitionVaultReplacementResume(
        this.#state,
        method === 'pin' ? { now, type: 'PIN_VERIFIED' } : { now, type: 'RECOVERY_VERIFIED' },
      );
      return this.#state;
    } finally {
      this.#authenticationActive = false;
    }
  }
}
