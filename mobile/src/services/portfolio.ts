import { createPublicClient, fallback, formatEther, formatUnits, http, type Address } from 'viem';

import { ARXI_TOKEN, NETWORK } from '@/config/network';
import { getPublicAsset } from '@/config/assets';
import { arxiReadAbi } from '@/contracts/arxi';
import { formatDisplayAmount } from '@/utils/amount';
import { getBlockFreshness } from '@/utils/freshness';

const publicClient = createPublicClient({
  chain: NETWORK.chain,
  transport: fallback(
    NETWORK.chain.rpcUrls.default.http.map((url) =>
      http(url, {
        retryCount: 1,
        timeout: 10_000,
      }),
    ),
  ),
  batch: { multicall: true },
});

export type PortfolioReadClient = Pick<
  typeof publicClient,
  'getBalance' | 'getBlock' | 'getBlockNumber' | 'getGasPrice' | 'readContract'
>;

export type Portfolio = {
  bnbBalance: string;
  bnbBalanceWei: string;
  arxiBalance: string;
  usdtBalance: string;
  gasPriceWei: string;
  isPaused: boolean;
  blockNumber: string;
  blockFreshness: string;
  isBlockStale: boolean;
  updatedAt: Date;
  updatedLabel: string;
};

export async function fetchPortfolio(address: Address): Promise<Portfolio> {
  return fetchPortfolioWithClient(publicClient, address);
}

export async function fetchPortfolioWithClient(
  client: PortfolioReadClient,
  address: Address,
): Promise<Portfolio> {
  const blockNumber = await client.getBlockNumber();
  const usdt = getPublicAsset('usdt');
  if (!usdt || usdt.kind !== 'bep20' || !('address' in usdt)) {
    throw new Error('Reviewed USDT contract is unavailable.');
  }
  const [bnb, arxi, usdtBalance, isPaused, block, gasPrice] = await Promise.all([
    client.getBalance({ address, blockNumber }),
    client.readContract({
      address: NETWORK.contracts.arxi,
      abi: arxiReadAbi,
      functionName: 'balanceOf',
      args: [address],
      blockNumber,
    }),
    client.readContract({
      address: usdt.address,
      abi: arxiReadAbi,
      functionName: 'balanceOf',
      args: [address],
      blockNumber,
    }),
    client.readContract({
      address: NETWORK.contracts.arxi,
      abi: arxiReadAbi,
      functionName: 'isPaused',
      blockNumber,
    }),
    client.getBlock({ blockNumber }),
    client.getGasPrice(),
  ]);

  const updatedAt = new Date();
  const blockTime = new Date(Number(block.timestamp) * 1_000);
  const freshness = getBlockFreshness(blockTime, updatedAt);
  return {
    bnbBalance: formatDisplayAmount(formatEther(bnb)),
    bnbBalanceWei: bnb.toString(),
    arxiBalance: formatDisplayAmount(formatUnits(arxi, ARXI_TOKEN.decimals)),
    usdtBalance: formatDisplayAmount(formatUnits(usdtBalance, usdt.decimals)),
    gasPriceWei: gasPrice.toString(),
    isPaused,
    blockNumber: blockNumber.toString(),
    blockFreshness: freshness.label,
    isBlockStale: freshness.isStale,
    updatedAt,
    updatedLabel: `Updated ${updatedAt.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    })}`,
  };
}
