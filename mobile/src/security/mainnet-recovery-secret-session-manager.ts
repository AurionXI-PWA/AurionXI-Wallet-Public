import { RecoverySecretSession, RecoverySecretSessionDestroyedError } from './recovery-secret-session';

let activeMainnetSession: RecoverySecretSession | null = null;

export function beginMainnetRecoverySecretSession(entropy: Uint8Array): void {
  const replacement = RecoverySecretSession.takeOwnership(entropy);
  activeMainnetSession?.destroy();
  activeMainnetSession = replacement;
}

export function withActiveMainnetRecoveryPhrase<T>(consumer: (phrase: string) => T): T {
  if (!activeMainnetSession || activeMainnetSession.destroyed) throw new RecoverySecretSessionDestroyedError();
  return activeMainnetSession.withPhrase(consumer);
}

export function withActiveMainnetRecoveryEntropyAsync<T>(consumer: (entropy: Uint8Array) => Promise<T>): Promise<T> {
  if (!activeMainnetSession || activeMainnetSession.destroyed) throw new RecoverySecretSessionDestroyedError();
  return activeMainnetSession.withEntropyAsync(consumer);
}

export function destroyActiveMainnetRecoverySecretSession(): void {
  activeMainnetSession?.destroy();
  activeMainnetSession = null;
}
