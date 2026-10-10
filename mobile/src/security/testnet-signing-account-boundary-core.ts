import {
  isPinConfirmedSigningSessionActive,
  type PinConfirmedSigningSession,
} from './pin-confirmed-signing-session';

export class TestnetSigningBoundaryError extends Error {
  constructor(message: 'PIN-confirmed signing session is expired.' | 'The signing account boundary is unavailable.') {
    super(message);
    this.name = 'TestnetSigningBoundaryError';
  }
}

type ScopedPayloadReader = <T>(consumer: (payload: Uint8Array) => Promise<T>) => Promise<T>;

/**
 * Defines the only shape by which a future platform vault adapter may provide
 * decrypted material to a future signer. The material is never returned from
 * this module and all account work must complete inside the supplied callback.
 * This boundary has no vault, PIN, account, signing, RPC, or broadcast implementation.
 */
export async function withPinConfirmedTestnetSigningMaterial<T>(input: {
  session: PinConfirmedSigningSession;
  now: number;
  withScopedPayload: ScopedPayloadReader;
  consume: (payload: Uint8Array) => Promise<T>;
}): Promise<T> {
  if (!isPinConfirmedSigningSessionActive(input.session, input.now)) {
    throw new TestnetSigningBoundaryError('PIN-confirmed signing session is expired.');
  }
  try {
    return await input.withScopedPayload(input.consume);
  } catch (error) {
    if (error instanceof TestnetSigningBoundaryError) throw error;
    throw new TestnetSigningBoundaryError('The signing account boundary is unavailable.');
  }
}
