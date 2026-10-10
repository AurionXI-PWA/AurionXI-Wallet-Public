import { describe, expect, it } from 'vitest';

import {
  getLockedMainnetTarget,
  getMainnetReadOnlyState,
} from './mainnet-readonly-boundary';

describe('Mainnet read-only boundary', () => {
  it('keeps the shared wallet target locked for signing', () => {
    expect(getLockedMainnetTarget()).toMatchObject({ chainId: 56, availability: 'locked' });
  });

  it('permits only the configured public read-only boundary', () => {
    expect(getMainnetReadOnlyState({ rpcUrlConfigured: true, arxiContractConfigured: true })).toEqual({
      state: 'read-only-enabled',
    });
  });
});
