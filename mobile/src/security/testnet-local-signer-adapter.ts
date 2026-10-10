import { WALLET_SECRET_FEATURE } from '@/config/network';

import type { ScopedTestnetSigner } from './testnet-signing-executor-core';
import { withTestnetSignerFromVaultPayload } from './testnet-scoped-signer-core';
import { unlockEncryptedVaultWithRetry } from './vault-workflow';

/**
 * Activation-neutral adapter. It keeps decrypted vault access inside a callback
 * and accepts an injected signer derivation strategy only in an explicitly
 * reviewed Testnet signing build. It has no RPC client and cannot submit a
 * transaction to BSC Testnet.
 */
export async function withFreshPinTestnetSigner<T>(input: {
  pin: string;
  deriveSigner: (entropy: Uint8Array) => ScopedTestnetSigner;
  consume: (signer: ScopedTestnetSigner) => Promise<T>;
}): Promise<T> {
  if (!WALLET_SECRET_FEATURE.enabled) {
    throw new Error('Testnet wallet-secret handling is disabled for this build.');
  }
  const payload = await unlockEncryptedVaultWithRetry(input.pin);
  return withTestnetSignerFromVaultPayload({
    payload,
    deriveSigner: input.deriveSigner,
    consume: input.consume,
  });
}
