import { describe, expect, it } from 'vitest';

import {
  MAINNET_PORTFOLIO_FUNCTION_URL,
  getMainnetPortfolioServiceBaseUrl,
  parseMainnetPortfolioResponse,
} from './mainnet-portfolio';

describe('Mainnet read-only portfolio client', () => {
  it('accepts only a valid BSC Mainnet fixed-asset response', () => {
    expect(parseMainnetPortfolioResponse({
      chainId: 56,
      blockNumber: '119644769',
      assets: { bnbWei: '1', arxiWei: '2', usdtWei: '3', usdcWei: '4', ethWei: '5', btcbWei: '6' },
      quote: { pendingNonce: '3', gasPriceWei: '4', observedAt: '2026-09-04T00:00:00.000Z' },
      valuation: { status: 'available', totalUsd: '12.34', observedAt: '2026-09-04T00:00:00.000Z' },
    })).toMatchObject({ chainId: 56, assets: { bnbWei: '1', arxiWei: '2', usdtWei: '3', usdcWei: '4', ethWei: '5', btcbWei: '6' } });
  });

  it('rejects wrong chains and malformed balance fields', () => {
    expect(() => parseMainnetPortfolioResponse({
      chainId: 97,
      blockNumber: '1',
      assets: { bnbWei: '1', arxiWei: '2', usdtWei: '3', usdcWei: '4', ethWei: '5' },
      valuation: { status: 'unavailable' },
    })).toThrow('Invalid Mainnet portfolio response.');
  });

  it('allows only a credential-free HTTPS Function URL', () => {
    expect(getMainnetPortfolioServiceBaseUrl(`${MAINNET_PORTFOLIO_FUNCTION_URL}/`))
      .toBe(MAINNET_PORTFOLIO_FUNCTION_URL);
    expect(getMainnetPortfolioServiceBaseUrl('http://example.test')).toBeUndefined();
    expect(getMainnetPortfolioServiceBaseUrl('https://attacker.example/walletMainnetPortfolio')).toBeUndefined();
  });
});
