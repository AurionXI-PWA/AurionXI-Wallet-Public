import { createPublicClient, erc20Abi, fallback, http, type Address } from 'viem';

import type { PublicAsset } from '@/config/assets';
import { NETWORK } from '@/config/network';
import type { TestnetReceiptPollClient } from './testnet-receipt-poller';

const publicClient = createPublicClient({
  chain: NETWORK.chain,
  transport: fallback(NETWORK.chain.rpcUrls.default.http.map((url) => http(url, { retryCount: 1, timeout: 10_000 }))),
});

export type TestnetTransactionSnapshotClient = Pick<typeof publicClient, 'getBalance' | 'getGasPrice' | 'getTransactionCount' | 'readContract'>;

/** Public receipt reader for an already-known Testnet transaction hash. */
export const testnetReceiptPollClient: TestnetReceiptPollClient = {
  getTransactionReceipt: (parameters) => publicClient.getTransactionReceipt(parameters),
};

export type TestnetTransactionSnapshot = {
  chainId: 97;
  nativeBalanceWei: bigint;
  assetBalanceWei: bigint;
  nonce: bigint;
  gasPriceWei: bigint;
};

/** Reads public BSC Testnet transaction metadata only. It cannot sign or broadcast. */
export async function fetchTestnetTransactionSnapshot(address: Address, asset: PublicAsset): Promise<TestnetTransactionSnapshot> {
  return fetchTestnetTransactionSnapshotWithClient(publicClient, address, asset);
}

export async function fetchTestnetTransactionSnapshotWithClient(
  client: TestnetTransactionSnapshotClient,
  address: Address,
  asset: PublicAsset,
): Promise<TestnetTransactionSnapshot> {
  const [nativeBalanceWei, nonce, gasPriceWei, assetBalanceWei] = await Promise.all([
    client.getBalance({ address }),
    client.getTransactionCount({ address, blockTag: 'pending' }),
    client.getGasPrice(),
    asset.kind === 'native'
      ? client.getBalance({ address })
      : client.readContract({ address: asset.address!, abi: erc20Abi, functionName: 'balanceOf', args: [address] }),
  ]);
  if (nativeBalanceWei < 0n || assetBalanceWei < 0n || nonce < 0 || gasPriceWei <= 0n) throw new Error('BSC Testnet transaction metadata is invalid.');
  return { chainId: 97, nativeBalanceWei, assetBalanceWei, nonce: BigInt(nonce), gasPriceWei };
}
