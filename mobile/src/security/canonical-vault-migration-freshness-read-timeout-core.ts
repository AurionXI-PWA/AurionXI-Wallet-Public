export const CANONICAL_VAULT_MIGRATION_FRESHNESS_READ_TIMEOUT_MS = 10_000;
export const CANONICAL_VAULT_MIGRATION_FRESHNESS_READ_TIMEOUT_MESSAGE =
  'Wallet storage safety verification timed out.';

type TimerHandle = ReturnType<typeof setTimeout>;

export type CanonicalVaultMigrationFreshnessReadTimeoutDependencies = {
  clearTimer: (handle: TimerHandle) => void;
  setTimer: (callback: () => void, delayMs: number) => TimerHandle;
};

const DEFAULT_DEPENDENCIES: CanonicalVaultMigrationFreshnessReadTimeoutDependencies = {
  clearTimer: (handle) => clearTimeout(handle),
  setTimer: (callback, delayMs) => setTimeout(callback, delayMs),
};

export function readCanonicalVaultMigrationFreshnessWithTimeout<T>(
  read: () => Promise<T>,
  timeoutMs = CANONICAL_VAULT_MIGRATION_FRESHNESS_READ_TIMEOUT_MS,
  dependencies = DEFAULT_DEPENDENCIES,
  signal?: AbortSignal,
): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let timer: TimerHandle | null = null;
    const settle = (next: () => void) => {
      if (settled) return;
      settled = true;
      if (timer !== null) dependencies.clearTimer(timer);
      signal?.removeEventListener('abort', cancel);
      next();
    };
    const cancel = () => settle(() => reject(new Error('Wallet storage safety verification was cancelled.')));
    if (signal?.aborted) {
      cancel();
      return;
    }
    signal?.addEventListener('abort', cancel, { once: true });
    timer = dependencies.setTimer(
      () => settle(() => reject(new Error(CANONICAL_VAULT_MIGRATION_FRESHNESS_READ_TIMEOUT_MESSAGE))),
      timeoutMs,
    );
    if (settled) dependencies.clearTimer(timer);
    let pendingRead: Promise<T>;
    try {
      pendingRead = Promise.resolve(read());
    } catch (error) {
      settle(() => reject(error));
      return;
    }
    pendingRead.then(
      (value) => settle(() => resolve(value)),
      (error) => settle(() => reject(error)),
    );
  });
}
