import type { Address } from 'viem';

import { withPinConfirmedTestnetSigningMaterial } from './testnet-signing-account-boundary-core';
import type { PinConfirmedSigningSession } from './pin-confirmed-signing-session';

export class TestnetSigningIdentityError extends Error {
  constructor(message: 'The decrypted vault does not match this wallet identity.' | 'The signing identity could not be derived.') {
    super(message);
    this.name = 'TestnetSigningIdentityError';
  }
}

/**
 * Confirms that scoped decrypted vault material derives the same public address
 * recorded for this wallet. It releases only that public address and keeps all
 * sensitive derivation material inside the scoped callback. Signing and
 * broadcast stay outside this adapter.
 */
export async function verifyPinConfirmedTestnetSigningIdentity(input: {
  session: PinConfirmedSigningSession;
  now: number;
  expectedAddress: Address;
  withScopedPayload: <T>(consumer: (payload: Uint8Array) => Promise<T>) => Promise<T>;
  deriveAddress: (payload: Uint8Array) => Address;
}): Promise<Address> {
  try {
    return await withPinConfirmedTestnetSigningMaterial({
      session: input.session,
      now: input.now,
      withScopedPayload: input.withScopedPayload,
      consume: async (payload) => {
        const address = input.deriveAddress(payload);
        if (address.toLowerCase() !== input.expectedAddress.toLowerCase()) {
          throw new TestnetSigningIdentityError('The decrypted vault does not match this wallet identity.');
        }
        return address;
      },
    });
  } catch (error) {
    if (error instanceof TestnetSigningIdentityError) throw error;
    throw new TestnetSigningIdentityError('The signing identity could not be derived.');
  }
}
