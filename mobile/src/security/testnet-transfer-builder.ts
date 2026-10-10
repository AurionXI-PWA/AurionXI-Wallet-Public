import { encodeFunctionData, type Address, type Hex } from 'viem';

import type { TestnetSendAuthorization } from './testnet-send-authorization';
import { isTestnetSendAuthorizationActive } from './testnet-send-authorization';
import type { ValidatedTransactionIntent } from './transaction-intent-policy';

const erc20TransferAbi = [{
  type: 'function', name: 'transfer', stateMutability: 'nonpayable',
  inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }],
  outputs: [{ name: '', type: 'bool' }],
}] as const;

export type PreparedTestnetTransfer = {
  chainId: 97;
  to: Address;
  data: Hex;
  value: bigint;
};

/** Builds an unsigned transfer payload only; it cannot sign, call an RPC, or broadcast. */
export function prepareTestnetTransfer(input: {
  authorization: TestnetSendAuthorization;
  intent: ValidatedTransactionIntent;
  now: number;
}): PreparedTestnetTransfer {
  if (!isTestnetSendAuthorizationActive(input.authorization, input.now)) {
    throw new Error('Testnet send authorization is expired.');
  }
  if (
    input.intent.chainId !== 97 ||
    input.authorization.assetId !== input.intent.asset.id ||
    input.authorization.recipient.toLowerCase() !== input.intent.recipient.toLowerCase() ||
    input.authorization.amount !== input.intent.amount
  ) throw new Error('Testnet authorization does not match the reviewed intent.');

  if (input.intent.asset.id === 'native-bnb') {
    return { chainId: 97, to: input.intent.recipient, data: '0x', value: input.intent.amount };
  }
  if (!input.intent.asset.address) throw new Error('Reviewed token contract is unavailable.');
  return {
    chainId: 97,
    to: input.intent.asset.address,
    data: encodeFunctionData({ abi: erc20TransferAbi, functionName: 'transfer', args: [input.intent.recipient, input.intent.amount] }),
    value: 0n,
  };
}
