import type { TestnetTransactionSnapshot } from '@/services/testnet-transaction-snapshot';

import type { TestnetFeeReadiness } from './testnet-fee-readiness';
import type { TestnetSigningEnvelope } from './testnet-signing-executor-core';
import type { PreparedTestnetTransfer } from './testnet-transfer-builder';

/** Binds reviewed unsigned transfer data to a single public nonce/gas snapshot. */
export function createTestnetSigningEnvelope(input: {
  transfer: PreparedTestnetTransfer;
  snapshot: TestnetTransactionSnapshot;
  fee: TestnetFeeReadiness;
}): TestnetSigningEnvelope {
  if (input.transfer.chainId !== 97 || input.snapshot.chainId !== 97) {
    throw new Error('Only BSC Testnet envelopes are supported.');
  }
  if (input.fee.state !== 'ready') {
    throw new Error('A verified Testnet network-fee estimate is required.');
  }
  if (
    input.fee.gasPriceWei !== input.snapshot.gasPriceWei
    || input.fee.feeWei !== input.fee.gasLimit * input.snapshot.gasPriceWei
  ) {
    throw new Error('The Testnet network-fee snapshot changed. Review again.');
  }
  if (input.snapshot.nonce > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('The Testnet account nonce is out of range.');
  }
  return {
    ...input.transfer,
    nonce: Number(input.snapshot.nonce),
    gas: input.fee.gasLimit,
    gasPrice: input.snapshot.gasPriceWei,
  };
}
