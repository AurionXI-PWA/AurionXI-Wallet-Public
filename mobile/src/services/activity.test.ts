import { describe, expect, it } from 'vitest';

import { getActivityServiceBaseUrl, mergeRecentActivity, parseActivityResponse, type ActivityItem } from './activity';

const hash: `0x${string}` = `0x${'a'.repeat(64)}`;

describe('activity response parsing', () => {
  it('accepts and converts a normalized proxy response', () => {
    const result = parseActivityResponse({
      cached: false,
      coverage: 'arxi-only',
      items: [
        {
          id: `native:${hash}`,
          hash,
          blockNumber: '100',
          timestamp: '2026-07-30T12:00:00.000Z',
          direction: 'Received',
          counterparty: '0x0000000000000000000000000000000000000001',
          amount: '1.5',
          symbol: 'tBNB',
          failed: false,
        },
      ],
    });

    expect(result.coverage).toBe('arxi-only');
    expect(result.cached).toBe(false);
    expect(result.items[0].timestamp).toEqual(new Date('2026-07-30T12:00:00.000Z'));
  });

  it('rejects malformed data instead of rendering it', () => {
    expect(() => parseActivityResponse({ coverage: 'full', items: [{ hash }] })).toThrow(
      'Invalid history response.',
    );
  });

  it('rejects a response without explicit history coverage', () => {
    expect(() => parseActivityResponse({ cached: false, items: [] })).toThrow('Invalid history response.');
  });

  it('rejects a response without an explicit cache disclosure', () => {
    expect(() => parseActivityResponse({ coverage: 'full', items: [] })).toThrow('Invalid history response.');
  });

  it('accepts reviewed USDT activity but rejects an unreviewed token symbol', () => {
    const baseItem = {
      id: `usdt:${hash}`,
      hash,
      blockNumber: '101',
      timestamp: '2026-08-13T00:00:00.000Z',
      direction: 'Received',
      counterparty: '0x0000000000000000000000000000000000000001',
      amount: '2',
      failed: false,
    };
    expect(parseActivityResponse({ cached: false, coverage: 'curated-assets', items: [{ ...baseItem, symbol: 'USDT' }] }).items[0].symbol).toBe('USDT');
    expect(() => parseActivityResponse({ cached: false, coverage: 'curated-assets', items: [{ ...baseItem, symbol: 'UNKNOWN' }] })).toThrow('Invalid history response.');
  });

  it('accepts the explicitly limited recent-token transfer coverage', () => {
    expect(parseActivityResponse({ cached: false, coverage: 'recent-curated-token-transfers', items: [] }).coverage)
      .toBe('recent-curated-token-transfers');
  });
});

describe('activity service URL policy', () => {
  it('allows only a credential-free HTTPS service base URL', () => {
    expect(getActivityServiceBaseUrl('https://history.aurionxi.example/api/')).toBe(
      'https://history.aurionxi.example/api',
    );
  });

  it('rejects insecure or credential-bearing service URLs', () => {
    expect(getActivityServiceBaseUrl('http://history.aurionxi.example')).toBeUndefined();
    expect(getActivityServiceBaseUrl('https://user:pass@history.aurionxi.example')).toBeUndefined();
    expect(getActivityServiceBaseUrl('https://history.aurionxi.example?key=value')).toBeUndefined();
  });
});

describe('recent activity merge', () => {
  it('keeps a confirmed native receipt alongside provider activity without duplicate hashes', () => {
    const native: ActivityItem = {
      id: `native-local:${hash}`,
      hash,
      blockNumber: '102',
      timestamp: new Date('2026-08-23T05:00:00.000Z'),
      direction: 'Sent',
      counterparty: '0x0000000000000000000000000000000000000001',
      amount: '0.0001',
      symbol: 'tBNB',
      failed: false,
    };
    const remote = { ...native, id: `native:${hash}`, timestamp: new Date('2026-08-23T04:00:00.000Z') };
    expect(mergeRecentActivity([remote], [native])).toEqual([native]);
  });
});
