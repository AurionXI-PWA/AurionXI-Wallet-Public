import type { CanonicalVaultMigrationLocalSubmitEvent } from './canonical-vault-migration-local-submit-policy';
import type { CanonicalVaultMigrationSnapshot } from './canonical-vault-migration-policy';
import { CanonicalVaultMigrationStartHarness } from './canonical-vault-migration-start-harness-core';
import {
  bindCanonicalVaultMigrationStartParentEvent,
  CanonicalVaultMigrationStartParentPublicationGate,
} from './canonical-vault-migration-start-parent-binding-core';
import type { CanonicalVaultMigrationStartViewState } from './canonical-vault-migration-start-view-controller';
import { recoverCanonicalVaultMigrationCallbackFailureViewState } from './canonical-vault-migration-start-failure-ui-signal-core';

type AuthenticatePin = (pin: string, signal: AbortSignal) => Promise<void>;
type SessionHarness = Pick<
  CanonicalVaultMigrationStartHarness,
  'begin' | 'checkExpiry' | 'getState' | 'handle' | 'restart'
> & { release?: () => void };
type HarnessFactory = (authenticatePin: AuthenticatePin) => SessionHarness;

const createHarness: HarnessFactory = (authenticatePin) => (
  new CanonicalVaultMigrationStartHarness({ authenticatePin })
);

export class CanonicalVaultMigrationStartParentSession {
  #authenticatePin: AuthenticatePin;
  #gate = new CanonicalVaultMigrationStartParentPublicationGate();
  #harness: SessionHarness;
  #harnessFactory: HarnessFactory;
  #recheckAuthorizedStart: ((signal: AbortSignal) => Promise<void>) | null;
  #recheckConfirmation: ((signal: AbortSignal) => Promise<void>) | null;
  #authorizedStartAbortController: AbortController | null = null;
  #authorizedStartSubmissionActive = false;
  #confirmationSubmissionActive = false;
  #confirmationAbortController: AbortController | null = null;
  #pinFlight = 0;
  #pinSubmissionActive: number | null = null;
  #readNow: () => number;
  #releasedHarnesses = new WeakSet<object>();
  #snapshot: CanonicalVaultMigrationSnapshot;
  readonly initialState: CanonicalVaultMigrationStartViewState;

  constructor(
    authenticatePin: AuthenticatePin,
    snapshot: CanonicalVaultMigrationSnapshot,
    harnessFactory: HarnessFactory = createHarness,
    recheckConfirmation: ((signal: AbortSignal) => Promise<void>) | null = null,
    recheckAuthorizedStart: ((signal: AbortSignal) => Promise<void>) | null = null,
    readNow: () => number = Date.now,
  ) {
    this.#authenticatePin = authenticatePin;
    this.#snapshot = snapshot;
    this.#harnessFactory = harnessFactory;
    this.#recheckAuthorizedStart = recheckAuthorizedStart;
    this.#recheckConfirmation = recheckConfirmation;
    this.#readNow = readNow;
    this.#harness = harnessFactory(authenticatePin);
    this.initialState = this.#harness.begin(snapshot);
    this.#gate.activate();
  }

  activate(): void {
    this.#gate.activate();
  }

  #releaseHarness(harness: SessionHarness): void {
    if (this.#releasedHarnesses.has(harness)) return;
    this.#releasedHarnesses.add(harness);
    try {
      harness.release?.();
    } catch {
      // Retired resource cleanup must not alter authorization flow.
    }
  }

  dispose(): void {
    this.#gate.dispose();
    this.#confirmationAbortController?.abort();
    this.#confirmationAbortController = null;
    this.#confirmationSubmissionActive = false;
    this.#authorizedStartAbortController?.abort();
    this.#authorizedStartAbortController = null;
    this.#authorizedStartSubmissionActive = false;
  }

  getState(): CanonicalVaultMigrationStartViewState {
    return this.#harness.getState();
  }

  checkExpiry(now = Date.now()): CanonicalVaultMigrationStartViewState {
    return this.#harness.checkExpiry(now);
  }

  capturePublicationGuard(): () => boolean {
    return this.#gate.captureLifecyclePublication();
  }

  cancelPendingPin(): CanonicalVaultMigrationStartViewState | null {
    if (!this.#harness.getState().busy) return null;
    const retiredHarness = this.#harness;
    const replacementHarness = this.#harnessFactory(this.#authenticatePin);
    const replacementState = replacementHarness.begin(this.#snapshot);
    this.#harness = replacementHarness;
    this.#pinSubmissionActive = null;
    this.#releaseHarness(retiredHarness);
    return replacementState;
  }

  restartAuthorization(): CanonicalVaultMigrationStartViewState {
    return this.#harness.restart(this.#snapshot);
  }

  matches(authenticatePin: AuthenticatePin, snapshot: CanonicalVaultMigrationSnapshot): boolean {
    return this.#authenticatePin === authenticatePin && this.#snapshot === snapshot;
  }

  async submit(
    event: CanonicalVaultMigrationLocalSubmitEvent,
    publishState: (state: CanonicalVaultMigrationStartViewState) => void,
    now = Date.now(),
  ) {
    let effectiveNow = now;
    if (event.type === 'VERIFY_PIN_REQUESTED' && this.#pinSubmissionActive !== null) return null;
    if (event.type === 'CONFIRM_AUTHORIZATION_REQUESTED' && this.#confirmationSubmissionActive) {
      return null;
    }
    if (event.type === 'CONFIRM_AUTHORIZATION_REQUESTED' && this.#recheckConfirmation) {
      const canContinue = this.#gate.captureLifecyclePublication();
      const abortController = new AbortController();
      this.#confirmationAbortController = abortController;
      this.#confirmationSubmissionActive = true;
      try {
        await this.#recheckConfirmation(abortController.signal);
      } catch {
        if (canContinue()) {
          publishState(recoverCanonicalVaultMigrationCallbackFailureViewState(
            () => this.restartAuthorization(),
            this.initialState,
          ));
        }
        return null;
      } finally {
        if (this.#confirmationAbortController === abortController) {
          this.#confirmationAbortController = null;
          this.#confirmationSubmissionActive = false;
        }
      }
      if (!canContinue()) return null;
      effectiveNow = this.#readNow();
      const expiryState = this.#harness.checkExpiry(effectiveNow);
      if (expiryState.screen.primaryAction !== 'confirm-authorization') {
        publishState(expiryState);
        return null;
      }
    }
    if (event.type === 'AUTHORIZED_START_REQUESTED' && this.#authorizedStartSubmissionActive) {
      return null;
    }
    if (event.type === 'AUTHORIZED_START_REQUESTED' && this.#recheckAuthorizedStart) {
      const canContinue = this.#gate.captureLifecyclePublication();
      const abortController = new AbortController();
      this.#authorizedStartAbortController = abortController;
      this.#authorizedStartSubmissionActive = true;
      try {
        await this.#recheckAuthorizedStart(abortController.signal);
      } catch {
        if (canContinue()) {
          publishState(recoverCanonicalVaultMigrationCallbackFailureViewState(
            () => this.restartAuthorization(),
            this.initialState,
          ));
        }
        return null;
      } finally {
        if (this.#authorizedStartAbortController === abortController) {
          this.#authorizedStartAbortController = null;
          this.#authorizedStartSubmissionActive = false;
        }
      }
      if (!canContinue()) return null;
      const expiryState = this.#harness.checkExpiry(this.#readNow());
      if (expiryState.screen.primaryAction !== 'submit-authorized-start') {
        publishState(expiryState);
        return null;
      }
    }
    const isPinSubmission = event.type === 'VERIFY_PIN_REQUESTED';
    const pinFlight = isPinSubmission ? ++this.#pinFlight : null;
    const flightHarness = this.#harness;
    if (pinFlight !== null) this.#pinSubmissionActive = pinFlight;
    try {
      return await bindCanonicalVaultMigrationStartParentEvent(
        flightHarness,
        event,
        publishState,
        effectiveNow,
        this.#gate.beginRequest(),
      );
    } finally {
      if (pinFlight !== null && this.#pinSubmissionActive === pinFlight) {
        this.#pinSubmissionActive = null;
      }
      if (pinFlight !== null && flightHarness !== this.#harness) {
        this.#releaseHarness(flightHarness);
      }
    }
  }
}
