import { describe, expect, it } from 'vitest';

import { normalizeAddress, shortenAddress } from './address';

const ADDRESS = '0x3A3f02F22a6Cf16122A7C752B73E65E05Df466fA';

describe('normalizeAddress', () => {
  it('normalizes a valid address', () => {
    expect(normalizeAddress(`  ${ADDRESS}  `)).toEqual({ ok: true, address: ADDRESS });
  });

  it('rejects an empty value', () => {
    expect(normalizeAddress(' ').ok).toBe(false);
  });

  it('rejects a recovery phrase', () => {
    expect(normalizeAddress('never enter a seed phrase here').ok).toBe(false);
  });
});

describe('shortenAddress', () => {
  it('keeps identifiable address edges', () => {
    expect(shortenAddress(ADDRESS)).toBe('0x3A3f02…f466fA');
  });
});
