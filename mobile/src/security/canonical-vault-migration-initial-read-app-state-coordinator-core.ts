export class CanonicalVaultMigrationInitialReadAppStateCoordinator {
  #active: boolean;

  constructor(initiallyActive: boolean) {
    this.#active = initiallyActive;
  }

  background(): boolean {
    if (!this.#active) return false;
    this.#active = false;
    return true;
  }

  foreground(): boolean {
    if (this.#active) return false;
    this.#active = true;
    return true;
  }
}
