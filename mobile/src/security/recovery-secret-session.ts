import { entropyToMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';

import { zeroizeBytes } from './secret-memory';

const RECOVERY_ENTROPY_LENGTHS = Object.freeze([16, 20, 24, 28, 32] as const);

export class RecoverySecretSessionDestroyedError extends Error {
  constructor() {
    super('The recovery-secret session is no longer available.');
    this.name = 'RecoverySecretSessionDestroyedError';
  }
}

export class RecoverySecretSession {
  readonly #entropy: Uint8Array;
  #destroyed = false;
  #phraseAccessActive = false;

  private constructor(entropy: Uint8Array) {
    this.#entropy = entropy;
  }

  static takeOwnership(sourceEntropy: Uint8Array): RecoverySecretSession {
    if (!RECOVERY_ENTROPY_LENGTHS.includes(
      sourceEntropy.length as (typeof RECOVERY_ENTROPY_LENGTHS)[number],
    )) {
      zeroizeBytes(sourceEntropy);
      throw new Error('Recovery entropy length is invalid.');
    }
    const owned = sourceEntropy.slice();
    zeroizeBytes(sourceEntropy);
    return new RecoverySecretSession(owned);
  }

  get destroyed(): boolean {
    return this.#destroyed;
  }

  withPhrase<T>(consumer: (phrase: string) => T): T {
    if (this.#destroyed) throw new RecoverySecretSessionDestroyedError();
    if (this.#phraseAccessActive) throw new Error('Concurrent recovery phrase access is blocked.');
    this.#phraseAccessActive = true;
    try {
      // JavaScript strings cannot be overwritten. Keep phrase creation inside
      // a synchronous callback so this boundary does not retain it itself.
      return consumer(entropyToMnemonic(this.#entropy, wordlist));
    } finally {
      this.#phraseAccessActive = false;
    }
  }

  withEntropy<T>(consumer: (entropy: Uint8Array) => T): T {
    if (this.#destroyed) throw new RecoverySecretSessionDestroyedError();
    const copy = this.#entropy.slice();
    try {
      return consumer(copy);
    } finally {
      zeroizeBytes(copy);
    }
  }

  async withEntropyAsync<T>(consumer: (entropy: Uint8Array) => Promise<T>): Promise<T> {
    if (this.#destroyed) throw new RecoverySecretSessionDestroyedError();
    const copy = this.#entropy.slice();
    try {
      return await consumer(copy);
    } finally {
      zeroizeBytes(copy);
    }
  }

  destroy(): void {
    if (this.#destroyed) return;
    zeroizeBytes(this.#entropy);
    this.#destroyed = true;
  }
}
