type TimerHandle = ReturnType<typeof setTimeout>;

export type CanonicalVaultMigrationStartExpirySchedulerDependencies = {
  clearTimer: (handle: TimerHandle) => void;
  setTimer: (callback: () => void, delayMs: number) => TimerHandle;
};

const DEFAULT_DEPENDENCIES: CanonicalVaultMigrationStartExpirySchedulerDependencies = {
  clearTimer: (handle) => clearTimeout(handle),
  setTimer: (callback, delayMs) => setTimeout(callback, delayMs),
};

export class CanonicalVaultMigrationStartExpiryScheduler {
  #dependencies: CanonicalVaultMigrationStartExpirySchedulerDependencies;
  #disposed = false;
  #generation = 0;
  #timer: TimerHandle | null = null;

  constructor(dependencies = DEFAULT_DEPENDENCIES) {
    this.#dependencies = dependencies;
  }

  activate(): void {
    this.#disposed = false;
    this.#generation += 1;
    this.#clear();
  }

  #clear(): void {
    if (this.#timer !== null) this.#dependencies.clearTimer(this.#timer);
    this.#timer = null;
  }

  cancel(): void {
    this.#generation += 1;
    this.#clear();
  }

  dispose(): void {
    this.#disposed = true;
    this.cancel();
  }

  schedule(expiresAt: number, now: number, expire: (expiresAt: number) => void): void {
    if (this.#disposed) return;
    this.#clear();
    const generation = ++this.#generation;
    this.#timer = this.#dependencies.setTimer(() => {
      if (this.#disposed || generation !== this.#generation) return;
      this.#timer = null;
      expire(expiresAt);
    }, Math.max(0, expiresAt - now));
  }
}
