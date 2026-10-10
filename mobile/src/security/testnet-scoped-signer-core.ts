import { zeroizeBytes } from './secret-memory';
import { decodeRecoveryVaultPayload } from './recovery-vault-payload';
import type { ScopedTestnetSigner } from './testnet-signing-executor-core';

/**
 * Converts an already-decrypted vault payload into a callback-scoped signer.
 * The decoded entropy is wiped in every outcome and the signer cannot escape
 * unless a caller deliberately returns it (which the app adapter never does).
 */
export async function withTestnetSignerFromVaultPayload<T>(input: {
  payload: Uint8Array;
  deriveSigner: (entropy: Uint8Array) => ScopedTestnetSigner;
  consume: (signer: ScopedTestnetSigner) => Promise<T>;
}): Promise<T> {
  let entropy: Uint8Array | undefined;
  try {
    entropy = decodeRecoveryVaultPayload(input.payload).entropy;
    const signer = input.deriveSigner(entropy);
    return await input.consume(signer);
  } finally {
    zeroizeBytes(entropy);
    zeroizeBytes(input.payload);
  }
}
