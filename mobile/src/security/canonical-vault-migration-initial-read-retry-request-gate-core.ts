export class CanonicalVaultMigrationInitialReadRetryRequestGate {
  #pending = false;

  tryBegin(): boolean {
    if (this.#pending) return false;
    this.#pending = true;
    return true;
  }

  release(): void {
    this.#pending = false;
  }
}
