import { keccak256, type Hash, type Hex } from 'viem';

export type ScopedSignedTestnetPayload = {
  hash: Hash;
  serializedTransaction: Hex;
};

/**
 * Makes a signed transaction available only to an immediate callback and
 * derives its canonical hash. Callers must retain only the hash for UI status;
 * this module never persists or broadcasts the serialized transaction.
 */
export async function withScopedSignedTestnetPayload<T>(input: {
  serializedTransaction: Hex;
  consume: (payload: ScopedSignedTestnetPayload) => Promise<T>;
}): Promise<T> {
  return input.consume({
    hash: keccak256(input.serializedTransaction),
    serializedTransaction: input.serializedTransaction,
  });
}
