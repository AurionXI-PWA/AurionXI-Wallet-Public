import type { Address } from 'viem';

const BSC_MAINNET_CHAIN_ID = 56;
export const MAINNET_PORTFOLIO_FUNCTION_ORIGIN = 'https://asia-south1-aurionxi.cloudfunctions.net';
export const MAINNET_PORTFOLIO_FUNCTION_PATH = '/walletMainnetPortfolio';
export const MAINNET_PORTFOLIO_FUNCTION_URL = `${MAINNET_PORTFOLIO_FUNCTION_ORIGIN}${MAINNET_PORTFOLIO_FUNCTION_PATH}`;

export type MainnetPortfolio = {
  chainId: 56;
  blockNumber: string;
  assets: {
    bnbWei: string;
    arxiWei: string;
    /** Added by the curated-assets function revision; absent until it is deployed. */
    usdtWei?: string;
    usdcWei?: string;
    ethWei?: string;
    btcbWei?: string;
  };
  quote: {
    pendingNonce: string;
    gasPriceWei: string;
    observedAt: string;
  };
  valuation: {
    status: 'available' | 'unavailable';
    totalUsd?: string;
    observedAt?: string;
    sources?: {
      bnb: 'coingecko'; usdt: 'coingecko'; usdc: 'coingecko'; eth: 'coingecko'; btcb: 'coingecko';
      arxi: 'pancakeswap-v2-arxi-usdt';
    };
    arxiPair?: Address;
    arxiLiquidityUsd?: string;
    arxiLiquidityStatus?: 'verified' | 'low';
    assets?: Partial<Record<'bnb' | 'arxi' | 'usdt' | 'usdc' | 'eth' | 'btcb', { priceUsd: string; valueUsd: string }>>;
  };
};

export class MainnetPortfolioConfigurationError extends Error {
  constructor() {
    super('Mainnet portfolio data service is not configured for this release.');
    this.name = 'MainnetPortfolioConfigurationError';
  }
}

/** Fixed public Function endpoint only; credentials and RPC URLs never belong in the app. */
export function getMainnetPortfolioServiceBaseUrl(
  value = process.env.EXPO_PUBLIC_MAINNET_PORTFOLIO_API_URL,
): string | undefined {
  const candidate = value?.trim().replace(/\/$/, '');
  if (!candidate) return undefined;
  try {
    const url = new URL(candidate);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || candidate !== MAINNET_PORTFOLIO_FUNCTION_URL) return undefined;
    return MAINNET_PORTFOLIO_FUNCTION_URL;
  } catch {
    return undefined;
  }
}

export function parseMainnetPortfolioResponse(payload: unknown): MainnetPortfolio {
  if (!payload || typeof payload !== 'object') throw new Error('Invalid Mainnet portfolio response.');
  const response = payload as Partial<MainnetPortfolio>;
  if (
    response.chainId !== BSC_MAINNET_CHAIN_ID
    || !/^\d+$/.test(String(response.blockNumber || ''))
    || !response.assets
    || !/^\d+$/.test(String(response.assets.bnbWei || ''))
    || !/^\d+$/.test(String(response.assets.arxiWei || ''))
    || (response.assets.usdtWei !== undefined && !/^\d+$/.test(String(response.assets.usdtWei)))
    || (response.assets.usdcWei !== undefined && !/^\d+$/.test(String(response.assets.usdcWei)))
    || (response.assets.ethWei !== undefined && !/^\d+$/.test(String(response.assets.ethWei)))
    || (response.assets.btcbWei !== undefined && !/^\d+$/.test(String(response.assets.btcbWei)))
    || !response.quote
    || !/^\d+$/.test(String(response.quote.pendingNonce || ''))
    || !/^\d+$/.test(String(response.quote.gasPriceWei || ''))
    || Number.isNaN(Date.parse(String(response.quote.observedAt || '')))
    || !response.valuation
    || (response.valuation.status !== 'available' && response.valuation.status !== 'unavailable')
    || (response.valuation.status === 'available' && (!/^\d+(\.\d{2})$/.test(String(response.valuation.totalUsd || '')) || Number.isNaN(Date.parse(String(response.valuation.observedAt || '')))))
  ) {
    throw new Error('Invalid Mainnet portfolio response.');
  }
  return response as MainnetPortfolio;
}

/**
 * Deliberate opt-in client. No screen calls this while Mainnet remains locked.
 */
export async function fetchMainnetPortfolio(address: Address): Promise<MainnetPortfolio> {
  const baseUrl = getMainnetPortfolioServiceBaseUrl();
  if (!baseUrl) throw new MainnetPortfolioConfigurationError();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(
      `${baseUrl}/v1/bsc-mainnet/portfolio?address=${encodeURIComponent(address)}`,
      { signal: controller.signal },
    );
    if (!response.ok) throw new Error('Mainnet portfolio service is temporarily unavailable.');
    return parseMainnetPortfolioResponse(await response.json());
  } finally {
    clearTimeout(timeout);
  }
}
