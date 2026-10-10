import type { Address } from 'viem';

export const MAINNET_QUOTE_MAX_AGE_MS = 30_000;

/** Public network data held in memory, never reconstructed from a route. */
export type MainnetTrustedQuote = Readonly<{
  walletAddress: Address;
  chainId: 56;
  bnbWei: string;
  arxiWei: string;
  /** Missing on old backend revisions; never substitute a BNB balance. */
  usdtWei?: string;
  blockNumber: string;
  pendingNonce: string;
  gasPriceWei: string;
  observedAt: string;
}>;

export function isMainnetTrustedQuoteFresh(quote: MainnetTrustedQuote, now = Date.now()): boolean {
  const observedAt = Date.parse(quote.observedAt);
  return quote.chainId === 56 && Number.isFinite(observedAt) && observedAt <= now && now - observedAt < MAINNET_QUOTE_MAX_AGE_MS;
}
