import { encodeFunctionData, type Address, type Hex } from 'viem';

import {
  isSyntheticTestnetBroadcastAuthorizationActive,
  type SyntheticTestnetBroadcastAuthorization,
} from './synthetic-testnet-broadcast-authorization';
import type { ValidatedTransactionIntent } from './transaction-intent-policy';

const arxiTransferAbi = [{
  type: 'function',
  name: 'transfer',
  stateMutability: 'nonpayable',
  inputs: [
    { name: 'to', type: 'address' },
    { name: 'amount', type: 'uint256' },
  ],
  outputs: [{ name: '', type: 'bool' }],
}] as const;

export type PreparedSyntheticTestnetTransfer = {
  chainId: 97;
  to: Address;
  data: Hex;
  value: 0n;
};

/**
 * Builds an unsigned, unsent ARXI Testnet transfer payload only.
 * It deliberately has no signer, account, client, storage, or network dependency.
 */
export function prepareSyntheticTestnetArxiTransfer(input: {
  authorization: SyntheticTestnetBroadcastAuthorization;
  intent: ValidatedTransactionIntent;
  now: number;
}): PreparedSyntheticTestnetTransfer {
  if (!isSyntheticTestnetBroadcastAuthorizationActive(input.authorization, input.now)) {
    throw new Error('Synthetic Testnet authorization is expired.');
  }
  if (
    input.intent.chainId !== 97 ||
    input.intent.asset.id !== 'arxi' ||
    input.authorization.assetId !== 'arxi' ||
    input.intent.recipient.toLowerCase() !== input.authorization.recipient.toLowerCase() ||
    input.intent.amount !== input.authorization.amount
  ) {
    throw new Error('Synthetic Testnet authorization does not match the reviewed intent.');
  }
  if (!input.intent.asset.address) throw new Error('Reviewed ARXI contract is unavailable.');

  return {
    chainId: 97,
    to: input.intent.asset.address,
    data: encodeFunctionData({
      abi: arxiTransferAbi,
      functionName: 'transfer',
      args: [input.intent.recipient, input.intent.amount],
    }),
    value: 0n,
  };
}
