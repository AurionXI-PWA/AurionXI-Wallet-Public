import { describe, expect, it } from 'vitest';

import { arxiReadAbi } from './arxi';

describe('ARXI read ABI', () => {
  it('contains only view functions for the portfolio read path', () => {
    expect(arxiReadAbi).toHaveLength(5);
    expect(arxiReadAbi.map((item) => item.name)).toEqual([
      'name', 'symbol', 'decimals', 'balanceOf', 'isPaused',
    ]);
    expect(arxiReadAbi.every((item) => item.type === 'function' && item.stateMutability === 'view')).toBe(true);
  });
});
