import type { Address, Hex } from 'viem';

import type { PinConfirmedSigningSession } from './pin-confirmed-signing-session';
import {
  signPinConfirmedTestnetEnvelope,
  type ScopedTestnetSigner,
  type TestnetSigningEnvelope,
} from './testnet-signing-executor-core';

/** Pure callback-scoped signing core: no configuration, storage, or network. */
export async function signTestnetEnvelopeWithFreshPinCore(input: {
  envelope: TestnetSigningEnvelope;
  expectedAddress: Address;
  now: number;
  session: PinConfirmedSigningSession;
  withScopedSigner: <T>(consumer: (signer: ScopedTestnetSigner) => Promise<T>) => Promise<T>;
}): Promise<Hex> {
  return signPinConfirmedTestnetEnvelope({
    envelope: input.envelope,
    expectedAddress: input.expectedAddress,
    now: input.now,
    session: input.session,
    withScopedSigner: input.withScopedSigner,
  });
}
