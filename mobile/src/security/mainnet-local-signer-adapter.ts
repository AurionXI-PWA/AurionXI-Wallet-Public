import type { ScopedMainnetSigner } from './mainnet-signing-executor-core';

/**
 * Deliberate hard stop for the legacy JavaScript vault-to-signer route.
 * A future released signer must use the native biometric vault and native
 * semantic verifier; it must never revive this adapter as a fallback.
 */
export async function withFreshPinMainnetSigner<T>(input: {
  pin: string;
  deriveSigner: (entropy: Uint8Array) => ScopedMainnetSigner;
  consume: (signer: ScopedMainnetSigner) => Promise<T>;
}): Promise<T> {
  // Keep the API shape temporarily so any accidental caller fails closed.
  // Do not read `input.pin`, invoke the callbacks, or unlock legacy material.
  void input;
  throw new Error('Legacy JavaScript Mainnet signing is permanently disabled. Use the native signer release path.');
}
