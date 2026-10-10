import type { Hash, Hex } from 'viem';

import {
  withAuthorizedTestnetBroadcast,
  type ExplicitTestnetBroadcastApproval,
  type TestnetBroadcastGateResult,
} from './testnet-broadcast-gate';
import type { PinConfirmedSigningSession } from './pin-confirmed-signing-session';
import { broadcastSignedTestnetTransaction, type TestnetRpcBroadcasterClient } from '@/services/testnet-rpc-broadcaster';
import { pollTestnetTransactionReceipt, type TestnetReceiptPollClient, type TestnetReceiptPollResult } from '@/services/testnet-receipt-poller';

export type TestnetExecutionCoordinatorResult =
  | { state: 'blocked'; gate: Exclude<TestnetBroadcastGateResult, { ok: true }> }
  | { state: 'submitted'; hash: Hash; receipt: TestnetReceiptPollResult };

/**
 * Runs a one-time approved Testnet broadcast sequence. It cannot be invoked
 * without the external explicit approval object; signer creation remains
 * outside this coordinator, and it never stores raw signed transaction data.
 */
export async function executeApprovedTestnetBroadcast(input: {
  chainId: number;
  chainIsTestnet: boolean;
  rpcConfigured: boolean;
  session: PinConfirmedSigningSession;
  approval?: ExplicitTestnetBroadcastApproval;
  expectedHash: Hash;
  serializedTransaction: Hex;
  now: number;
  broadcaster: TestnetRpcBroadcasterClient;
  receiptReader: TestnetReceiptPollClient;
}): Promise<TestnetExecutionCoordinatorResult> {
  const gated = await withAuthorizedTestnetBroadcast({
    chainId: input.chainId,
    chainIsTestnet: input.chainIsTestnet,
    rpcConfigured: input.rpcConfigured,
    session: input.session,
    approval: input.approval,
    expectedHash: input.expectedHash,
    serializedTransaction: input.serializedTransaction,
    now: input.now,
    consume: async (raw) => {
      const hash = await broadcastSignedTestnetTransaction(input.broadcaster, raw);
      const receipt = await pollTestnetTransactionReceipt(input.receiptReader, hash);
      return { hash, receipt };
    },
  });
  if (!gated.gate.ok) return { state: 'blocked', gate: gated.gate };
  if (!gated.value) throw new Error('Approved Testnet broadcast did not return a result.');
  return { state: 'submitted', ...gated.value };
}
