import { keccak256, type Hash, type Hex } from 'viem';

export type TestnetRpcBroadcasterClient = {
  sendRawTransaction: (parameters: { serializedTransaction: Hex }) => Promise<Hash>;
};

export class TestnetRpcBroadcastError extends Error {
  constructor(message: 'The RPC broadcaster returned an unexpected transaction hash.' | 'The Testnet broadcast request was not accepted.') {
    super(message);
    this.name = 'TestnetRpcBroadcastError';
  }
}

/**
 * Broadcasts only a pre-signed raw BSC Testnet transaction through a supplied
 * client. The caller must first pass the payload through the separate explicit
 * approval gate. No account, signing, storage, or RPC endpoint configuration
 * is present in this adapter.
 */
export async function broadcastSignedTestnetTransaction(
  client: TestnetRpcBroadcasterClient,
  serializedTransaction: Hex,
): Promise<Hash> {
  const expectedHash = keccak256(serializedTransaction);
  try {
    const returnedHash = await client.sendRawTransaction({ serializedTransaction });
    if (returnedHash.toLowerCase() !== expectedHash.toLowerCase()) {
      throw new TestnetRpcBroadcastError('The RPC broadcaster returned an unexpected transaction hash.');
    }
    return returnedHash;
  } catch (error) {
    if (error instanceof TestnetRpcBroadcastError) throw error;
    throw new TestnetRpcBroadcastError('The Testnet broadcast request was not accepted.');
  }
}
