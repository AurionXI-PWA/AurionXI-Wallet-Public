import {
  INITIAL_WALLET_IDENTITY_TRANSITION_AUTHORIZATION,
  transitionWalletIdentityAuthorization,
  type WalletIdentityTransitionAuthorization,
} from './wallet-identity-transition-authorization';
import type { WalletIdentityTransitionPlan } from './wallet-identity-transition-policy';

export type WalletIdentityTransitionControllerDependencies = {
  authenticatePin: (pin: string) => Promise<void>;
};

export class WalletIdentityTransitionController {
  #authenticationActive = false;
  #dependencies: WalletIdentityTransitionControllerDependencies;
  #state: WalletIdentityTransitionAuthorization = INITIAL_WALLET_IDENTITY_TRANSITION_AUTHORIZATION;

  constructor(dependencies: WalletIdentityTransitionControllerDependencies) {
    this.#dependencies = dependencies;
  }

  getState(): WalletIdentityTransitionAuthorization {
    return this.#state;
  }

  begin(plan: WalletIdentityTransitionPlan): WalletIdentityTransitionAuthorization {
    if (this.#authenticationActive) throw new Error('Identity transition authentication is already active.');
    this.#state = transitionWalletIdentityAuthorization(this.#state, { plan, type: 'BEGIN' });
    return this.#state;
  }

  async authenticatePin(pin: string, now = Date.now()): Promise<WalletIdentityTransitionAuthorization> {
    if (this.#state.stage !== 'awaiting-pin') {
      throw new Error('PIN authentication is not allowed for identity transition.');
    }
    if (this.#authenticationActive) throw new Error('Identity transition authentication is already active.');
    const stateAtStart = this.#state;
    this.#authenticationActive = true;
    try {
      await this.#dependencies.authenticatePin(pin);
      if (this.#state !== stateAtStart) {
        throw new Error('Identity transition authorization changed during authentication.');
      }
      this.#state = transitionWalletIdentityAuthorization(this.#state, {
        now,
        type: 'PIN_VERIFIED',
      });
      return this.#state;
    } finally {
      this.#authenticationActive = false;
    }
  }

  confirm(confirmation: string, now = Date.now()): WalletIdentityTransitionAuthorization {
    this.#state = transitionWalletIdentityAuthorization(this.#state, {
      confirmation,
      now,
      type: 'CONFIRM',
    });
    return this.#state;
  }

  reset(): void {
    this.#state = INITIAL_WALLET_IDENTITY_TRANSITION_AUTHORIZATION;
  }
}
