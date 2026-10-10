import { describe, expect, it } from 'vitest';

import { DEFAULT_MAINNET_ACTIVITY_API_URL, getMainnetActivityServiceBaseUrl, parseMainnetActivityResponse } from './mainnet-activity';

const hash = `0x${'b'.repeat(64)}`;
describe('Mainnet activity client', () => {
  it('accepts only an explicit curated Mainnet response', () => {
    expect(parseMainnetActivityResponse({ cached: false, coverage: 'recent-curated-transfers', items: [{ id: 'a', hash, blockNumber: '1', timestamp: '2026-09-03T00:00:00.000Z', direction: 'Received', counterparty: '0xEf7c8E41ba2707c2E92b8837Ff4B5EB55cec27e6', amount: '1', symbol: 'ARXI', failed: false }] }).items).toHaveLength(1);
  });
  it('accepts every reviewed Mainnet asset but rejects unreviewed tokens and insecure provider URLs', () => {
    for (const symbol of ['USDT', 'USDC', 'ETH', 'BTCB'] as const) {
      expect(parseMainnetActivityResponse({ cached: false, coverage: 'recent-curated-transfers', items: [{ id: 'a', hash, blockNumber: '1', timestamp: '2026-09-03T00:00:00.000Z', direction: 'Received', counterparty: '0xEf7c8E41ba2707c2E92b8837Ff4B5EB55cec27e6', amount: '1', symbol, failed: false }] }).items).toHaveLength(1);
    }
    expect(() => parseMainnetActivityResponse({ cached: false, coverage: 'recent-curated-transfers', items: [{ id: 'a', hash, blockNumber: '1', timestamp: '2026-09-03T00:00:00.000Z', direction: 'Received', counterparty: '0xEf7c8E41ba2707c2E92b8837Ff4B5EB55cec27e6', amount: '1', symbol: 'SCAM', failed: false }] })).toThrow('Invalid Mainnet activity response.');
    expect(getMainnetActivityServiceBaseUrl('http://example.com')).toBeUndefined();
    expect(getMainnetActivityServiceBaseUrl(`${DEFAULT_MAINNET_ACTIVITY_API_URL}/`)).toBe(DEFAULT_MAINNET_ACTIVITY_API_URL);
    expect(getMainnetActivityServiceBaseUrl('https://attacker.example/walletMainnetActivity')).toBeUndefined();
  });
});
