import { CANONICAL_VAULT_MIGRATION_START_AUTHORIZATION_MS } from './canonical-vault-migration-start-authorization';
import type { CanonicalVaultMigrationStartExpiryScheduler } from './canonical-vault-migration-start-expiry-scheduler-core';
import type { CanonicalVaultMigrationStartParentSession } from './canonical-vault-migration-start-parent-session-core';
import type { CanonicalVaultMigrationStartViewState } from './canonical-vault-migration-start-view-controller';

type ExpiryScheduler = Pick<
  CanonicalVaultMigrationStartExpiryScheduler,
  'activate' | 'cancel' | 'dispose' | 'schedule'
>;
type ParentSession = Pick<
  CanonicalVaultMigrationStartParentSession,
  'activate' | 'cancelPendingPin' | 'capturePublicationGuard' | 'checkExpiry' | 'dispose' | 'restartAuthorization'
>;
type PublishState = (state: CanonicalVaultMigrationStartViewState) => void;
type ReportCallbackFailure = () => void;

export class CanonicalVaultMigrationStartAppStateCoordinator {
  #active = true;
  #authorizationGeneration = 0;
  #clockInvalid = false;
  #expiryPublicationGuard: (() => boolean) | null = null;
  #expiresAt: number | null = null;
  #lastObservedAt: number | null = null;
  #reportCallbackFailure: ReportCallbackFailure;
  #scheduler: ExpiryScheduler;
  #session: ParentSession;

  constructor(
    session: ParentSession,
    scheduler: ExpiryScheduler,
    reportCallbackFailure: ReportCallbackFailure = () => undefined,
  ) {
    this.#session = session;
    this.#scheduler = scheduler;
    this.#reportCallbackFailure = reportCallbackFailure;
  }

  #reportIsolatedCallbackFailure(): void {
    try {
      this.#reportCallbackFailure();
    } catch {
      // Failure reporting must never escape a security timer callback.
    }
  }

  #schedule(now: number, publishState: PublishState): void {
    if (this.#expiresAt === null) return;
    const expiresAt = this.#expiresAt;
    const generation = this.#authorizationGeneration;
    const publicationGuard = this.#expiryPublicationGuard;
    if (!publicationGuard) return;
    this.#scheduler.schedule(expiresAt, now, (expiryInstant) => {
      this.#expireAuthorization(
        expiryInstant,
        generation,
        publicationGuard,
        expiryInstant,
        publishState,
        false,
      );
    });
  }

  #expireAuthorization(
    expectedExpiry: number,
    expectedGeneration: number,
    expectedPublicationGuard: () => boolean,
    observedAt: number,
    publishState: PublishState,
    cancelTimer: boolean,
  ): boolean {
    if (
      this.#expiresAt !== expectedExpiry ||
      this.#authorizationGeneration !== expectedGeneration ||
      this.#expiryPublicationGuard !== expectedPublicationGuard
    ) return false;
    try {
      if (!expectedPublicationGuard()) return false;
    } catch {
      this.#expiresAt = null;
      this.#expiryPublicationGuard = null;
      this.#authorizationGeneration += 1;
      if (cancelTimer) this.#scheduler.cancel();
      this.#reportIsolatedCallbackFailure();
      return true;
    }
    this.#expiresAt = null;
    this.#expiryPublicationGuard = null;
    this.#authorizationGeneration += 1;
    if (cancelTimer) this.#scheduler.cancel();
    try {
      publishState(this.#session.checkExpiry(observedAt));
    } catch {
      this.#reportIsolatedCallbackFailure();
    }
    return true;
  }

  #observeClock(now: number, publishState: PublishState): boolean {
    if (this.#lastObservedAt !== null && now < this.#lastObservedAt) {
      if (!this.#clockInvalid) {
        this.#clockInvalid = true;
        this.#expiresAt = null;
        this.#expiryPublicationGuard = null;
        this.#authorizationGeneration += 1;
        this.#scheduler.activate();
        publishState(this.#session.restartAuthorization());
      }
      return false;
    }
    this.#lastObservedAt = now;
    this.#clockInvalid = false;
    return true;
  }

  recordPinAuthorization(verifiedAt: number, publishState: PublishState): void {
    if (!this.#active || !this.#observeClock(verifiedAt, publishState)) return;
    this.#authorizationGeneration += 1;
    this.#expiresAt = verifiedAt + CANONICAL_VAULT_MIGRATION_START_AUTHORIZATION_MS;
    this.#expiryPublicationGuard = this.#session.capturePublicationGuard();
    this.#schedule(verifiedAt, publishState);
  }

  background(): void {
    if (!this.#active) return;
    this.#active = false;
    this.#session.cancelPendingPin();
    this.#scheduler.dispose();
    this.#session.dispose();
  }

  foreground(now: number, publishState: PublishState): void {
    const wasActive = this.#active;
    if (!wasActive) {
      this.#active = true;
      this.#scheduler.activate();
      this.#session.activate();
      this.#expiryPublicationGuard = this.#session.capturePublicationGuard();
    }
    if (!this.#observeClock(now, publishState)) return;
    if (this.#expiresAt !== null && now >= this.#expiresAt) {
      this.#expireAuthorization(
        this.#expiresAt,
        this.#authorizationGeneration,
        this.#expiryPublicationGuard!,
        now,
        publishState,
        true,
      );
      return;
    }
    if (wasActive) return;
    publishState(this.#session.checkExpiry(now));
    this.#schedule(now, publishState);
  }

  dispose(): void {
    this.#expiresAt = null;
    this.#expiryPublicationGuard = null;
    this.#authorizationGeneration += 1;
    this.#lastObservedAt = null;
    this.#clockInvalid = false;
    this.background();
  }
}
