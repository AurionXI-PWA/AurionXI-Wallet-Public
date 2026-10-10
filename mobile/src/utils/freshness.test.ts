import { describe, expect, it } from 'vitest';

import { getBlockFreshness } from './freshness';

const NOW = new Date('2026-07-30T12:00:00.000Z');

describe('getBlockFreshness', () => {
  it('reports a newly mined block as fresh', () => {
    expect(getBlockFreshness(new Date('2026-07-30T11:59:57.000Z'), NOW)).toEqual({
      label: 'Just now',
      isStale: false,
    });
  });

  it('shows seconds for a recent block', () => {
    expect(getBlockFreshness(new Date('2026-07-30T11:59:18.000Z'), NOW)).toEqual({
      label: '42s ago',
      isStale: false,
    });
  });

  it('marks data at least two minutes old as stale', () => {
    expect(getBlockFreshness(new Date('2026-07-30T11:57:00.000Z'), NOW)).toEqual({
      label: '3m ago',
      isStale: true,
    });
  });

  it('does not show negative age when device time is behind', () => {
    expect(getBlockFreshness(new Date('2026-07-30T12:00:05.000Z'), NOW)).toEqual({
      label: 'Just now',
      isStale: false,
    });
  });
});
