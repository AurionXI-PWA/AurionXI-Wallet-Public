import type { Address, Hex } from 'viem';

import { SIGNING_FEATURE } from '@/config/network';

import { withFreshPinTestnetSigner } from './testnet-local-signer-adapter';
import { deriveNativeTestnetSignerFromEntropy } from './testnet-native-signer-derivation';
import type { TestnetSigningEnvelope } from './testnet-signing-executor-core';
import type { PinConfirmedSigningSession } from './pin-confirmed-signing-session';
import { signTestnetEnvelopeWithFreshPinCore } from './testnet-native-signing-operation-core';

export class TestnetNativeSigningOperationError extends Error {
  constructor() {
    super('Testnet local signing is not enabled for this build.');
    this.name = 'TestnetNativeSigningOperationError';
  }
}

/**
 * Native, Testnet-only signing operation. The PIN exists only in the immediate
 * callback that unlocks the encrypted vault; the returned value is a signed
 * transaction payload, never a broadcast result.
 */
export async function signTestnetEnvelopeWithFreshPin(input: {
  envelope: TestnetSigningEnvelope;
  expectedAddress: Address;
  now: number;
  pin: string;
  session: PinConfirmedSigningSession;
}): Promise<Hex> {
  if (!SIGNING_FEATURE.enabled) throw new TestnetNativeSigningOperationError();
  return signTestnetEnvelopeWithFreshPinCore({
    envelope: input.envelope,
    expectedAddress: input.expectedAddress,
    now: input.now,
    session: input.session,
    withScopedSigner: (consume) => withFreshPinTestnetSigner({
      pin: input.pin,
      deriveSigner: deriveNativeTestnetSignerFromEntropy,
      consume,
    }),
  });
}
