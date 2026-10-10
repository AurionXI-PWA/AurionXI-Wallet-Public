import { describe, expect, it } from 'vitest';

import { formatDisplayAmount } from './amount';

describe('formatDisplayAmount', () => {
  it('groups whole units and trims insignificant zeroes', () => {
    expect(formatDisplayAmount('211000000.120000')).toBe('211,000,000.12');
  });

  it('caps precision without rounding up the displayed balance', () => {
    expect(formatDisplayAmount('0.123456789')).toBe('0.123456');
  });

  it('handles whole units', () => {
    expect(formatDisplayAmount('0')).toBe('0');
  });
});
