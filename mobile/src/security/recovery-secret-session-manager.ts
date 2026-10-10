import {
  RecoverySecretSession,
  RecoverySecretSessionDestroyedError,
} from './recovery-secret-session';

let activeSession: RecoverySecretSession | null = null;

export function beginRecoverySecretSession(entropy: Uint8Array): void {
  // Validate and take ownership before replacing the existing session. An
  // invalid replacement cannot destroy otherwise valid in-progress authority.
  const replacement = RecoverySecretSession.takeOwnership(entropy);
  activeSession?.destroy();
  activeSession = replacement;
}

export function hasActiveRecoverySecretSession(): boolean {
  return activeSession !== null && !activeSession.destroyed;
}

export function withActiveRecoveryPhrase<T>(consumer: (phrase: string) => T): T {
  if (!activeSession || activeSession.destroyed) {
    throw new RecoverySecretSessionDestroyedError();
  }
  return activeSession.withPhrase(consumer);
}

export function withActiveRecoveryEntropy<T>(consumer: (entropy: Uint8Array) => T): T {
  if (!activeSession || activeSession.destroyed) {
    throw new RecoverySecretSessionDestroyedError();
  }
  return activeSession.withEntropy(consumer);
}

export function withActiveRecoveryEntropyAsync<T>(
  consumer: (entropy: Uint8Array) => Promise<T>,
): Promise<T> {
  if (!activeSession || activeSession.destroyed) {
    throw new RecoverySecretSessionDestroyedError();
  }
  return activeSession.withEntropyAsync(consumer);
}

export function destroyActiveRecoverySecretSession(): void {
  activeSession?.destroy();
  activeSession = null;
}
