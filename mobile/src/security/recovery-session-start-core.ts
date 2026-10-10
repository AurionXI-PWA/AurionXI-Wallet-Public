import { zeroizeBytes } from './secret-memory';

const RECOVERY_ENTROPY_BYTES = 32;

export type RecoverySessionStartDependencies = {
  beginSession: (entropy: Uint8Array) => void;
  randomBytes: (length: number) => Promise<Uint8Array>;
  walletSecretFeatureEnabled: boolean;
};

export class RecoverySessionStartGate {
  #active = false;

  async run(dependencies: RecoverySessionStartDependencies): Promise<void> {
    if (!dependencies.walletSecretFeatureEnabled) {
      throw new Error('Wallet-secret handling is disabled for this build.');
    }
    if (this.#active) throw new Error('Recovery session start is already active.');
    this.#active = true;
    let entropy: Uint8Array | undefined;
    try {
      entropy = await dependencies.randomBytes(RECOVERY_ENTROPY_BYTES);
      if (entropy.length !== RECOVERY_ENTROPY_BYTES) {
        throw new Error('Secure random source returned an invalid entropy length.');
      }
      dependencies.beginSession(entropy);
    } finally {
      // The manager also overwrites transferred input. This finally covers
      // invalid lengths and dependency failures before ownership transfer.
      zeroizeBytes(entropy);
      this.#active = false;
    }
  }
}
