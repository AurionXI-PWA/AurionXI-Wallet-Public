import type { ScopedMainnetSigner } from './mainnet-signing-executor-core';

/** Creates an in-memory chain-56 signer only inside a scoped vault callback. */
export function deriveNativeMainnetSignerFromEntropy(entropy: Uint8Array): ScopedMainnetSigner {
  // Deliberately keep recovery material out of the JavaScript signing path.
  // A future release must provide an audited native, callback-scoped signer;
  // this placeholder must never be switched into a mnemonic-derived signer.
  void entropy;
  throw new Error('Mainnet signing is not released.');
}
