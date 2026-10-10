import { describe, expect, it } from 'vitest';

import { isMainnetTrustedQuoteFresh, MAINNET_QUOTE_MAX_AGE_MS } from './mainnet-trusted-quote';

const quote = {
  walletAddress: '0xEf7c8E41ba2707c2E92b8837Ff4B5EB55cec27e6' as const,
  chainId: 56 as const,
  bnbWei: '1', arxiWei: '2', blockNumber: '3', pendingNonce: '4', gasPriceWei: '5',
  observedAt: '2026-09-10T00:00:00.000Z',
};

describe('Mainnet trusted quote', () => {
  it('accepts only a recent BSC Mainnet quote', () => {
    const now = Date.parse(quote.observedAt) + MAINNET_QUOTE_MAX_AGE_MS - 1;
    expect(isMainnetTrustedQuoteFresh(quote, now)).toBe(true);
    expect(isMainnetTrustedQuoteFresh({ ...quote, chainId: 97 as 56 }, now)).toBe(false);
  });

  it('rejects expired, future, and invalid timestamps', () => {
    const now = Date.parse(quote.observedAt) + MAINNET_QUOTE_MAX_AGE_MS;
    expect(isMainnetTrustedQuoteFresh(quote, now)).toBe(false);
    expect(isMainnetTrustedQuoteFresh({ ...quote, observedAt: '2026-09-10T00:01:00.000Z' }, Date.parse(quote.observedAt))).toBe(false);
    expect(isMainnetTrustedQuoteFresh({ ...quote, observedAt: 'invalid' }, now)).toBe(false);
  });
});
