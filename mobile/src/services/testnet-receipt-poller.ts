import { TransactionReceiptNotFoundError, type Hash } from 'viem';

export type TestnetReceiptPollClient = {
  getTransactionReceipt: (parameters: { hash: Hash }) => Promise<{
    status: 'success' | 'reverted';
    blockNumber: bigint;
  }>;
};

export type TestnetReceiptPollResult =
  | { state: 'pending' }
  | { state: 'confirmed'; blockNumber: string }
  | { state: 'reverted'; blockNumber: string }
  | { state: 'unavailable' };

/** Reads one public receipt snapshot; it does not wait, sign, or send a transaction. */
export async function pollTestnetTransactionReceipt(
  client: TestnetReceiptPollClient,
  hash: Hash,
): Promise<TestnetReceiptPollResult> {
  try {
    const receipt = await client.getTransactionReceipt({ hash });
    return receipt.status === 'success'
      ? { state: 'confirmed', blockNumber: receipt.blockNumber.toString() }
      : { state: 'reverted', blockNumber: receipt.blockNumber.toString() };
  } catch (error) {
    if (error instanceof TransactionReceiptNotFoundError) return { state: 'pending' };
    return { state: 'unavailable' };
  }
}
