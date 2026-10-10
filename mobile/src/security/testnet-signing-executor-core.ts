import type { Address, Hex } from 'viem';

import { isPinConfirmedSigningSessionActive, type PinConfirmedSigningSession } from './pin-confirmed-signing-session';
import type { PreparedTestnetTransfer } from './testnet-transfer-builder';

export type TestnetSigningEnvelope = PreparedTestnetTransfer & {
  nonce: number;
  gas: bigint;
  gasPrice: bigint;
};

export type ScopedTestnetSigner = {
  address: Address;
  signTransaction: (transaction: TestnetSigningEnvelope) => Promise<Hex>;
};

export class TestnetSigningExecutorError extends Error {
  constructor(message: 'PIN-confirmed signing session is expired.' | 'The scoped signer does not match this wallet.' | 'Invalid Testnet signing envelope.' | 'Testnet signing did not complete.') {
    super(message);
    this.name = 'TestnetSigningExecutorError';
  }
}

/**
 * Signs only an already-approved BSC Testnet envelope inside a supplied scoped
 * signer callback. This function never constructs a network client, sends a
 * transaction, writes storage, or exposes the signer outside the callback.
 */
export async function signPinConfirmedTestnetEnvelope(input: {
  session: PinConfirmedSigningSession;
  now: number;
  expectedAddress: Address;
  envelope: TestnetSigningEnvelope;
  withScopedSigner: <T>(consumer: (signer: ScopedTestnetSigner) => Promise<T>) => Promise<T>;
}): Promise<Hex> {
  if (!isPinConfirmedSigningSessionActive(input.session, input.now)) {
    throw new TestnetSigningExecutorError('PIN-confirmed signing session is expired.');
  }
  if (
    input.envelope.chainId !== 97
    || input.envelope.gas <= 0n
    || input.envelope.gasPrice <= 0n
    || !Number.isSafeInteger(input.envelope.nonce)
    || input.envelope.nonce < 0
  ) {
    throw new TestnetSigningExecutorError('Invalid Testnet signing envelope.');
  }
  try {
    return await input.withScopedSigner(async (signer) => {
      if (signer.address.toLowerCase() !== input.expectedAddress.toLowerCase()) {
        throw new TestnetSigningExecutorError('The scoped signer does not match this wallet.');
      }
      return signer.signTransaction(input.envelope);
    });
  } catch (error) {
    if (error instanceof TestnetSigningExecutorError) throw error;
    throw new TestnetSigningExecutorError('Testnet signing did not complete.');
  }
}
