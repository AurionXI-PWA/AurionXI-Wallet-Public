import { decodeRecoveryVaultPayload } from './recovery-vault-payload';
import { zeroizeBytes } from './secret-memory';
import type { ScopedMainnetSigner } from './mainnet-signing-executor-core';
import { evaluateMainnetReadiness } from './mainnet-readiness-policy';

/** Converts one decrypted Mainnet vault payload into a callback-scoped signer and zeroizes transient entropy. */
export async function withMainnetSignerFromVaultPayload<T>(input: {
  payload: Uint8Array;
  deriveSigner: (entropy: Uint8Array) => ScopedMainnetSigner;
  consume: (signer: ScopedMainnetSigner) => Promise<T>;
}): Promise<T> {
  if (!evaluateMainnetReadiness('sign').allowed) throw new Error('Mainnet signing is not released.');
  let entropy: Uint8Array | undefined;
  try {
    entropy = decodeRecoveryVaultPayload(input.payload).entropy;
    return await input.consume(input.deriveSigner(entropy));
  } finally {
    zeroizeBytes(entropy);
    zeroizeBytes(input.payload);
  }
}
