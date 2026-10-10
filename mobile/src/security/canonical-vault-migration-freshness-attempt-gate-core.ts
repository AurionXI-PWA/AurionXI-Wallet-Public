export type CanonicalVaultMigrationFreshnessReadAttempt = {
  isCurrent: () => boolean;
  retire: () => void;
};

export class CanonicalVaultMigrationFreshnessAttemptGate {
  #generation = 0;

  invalidate(): void {
    this.#generation += 1;
  }

  begin(): CanonicalVaultMigrationFreshnessReadAttempt {
    const generation = ++this.#generation;
    return {
      isCurrent: () => this.#generation === generation,
      retire: () => {
        if (this.#generation === generation) this.#generation += 1;
      },
    };
  }
}
