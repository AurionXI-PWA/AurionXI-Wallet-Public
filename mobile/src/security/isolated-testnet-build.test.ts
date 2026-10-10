import { describe, expect, it } from 'vitest';

import { isIsolatedTestnetBuild } from './isolated-testnet-build';

describe('isolated Testnet build identity', () => {
  it('only accepts the native isolated Testnet version suffix', () => {
    expect(isIsolatedTestnetBuild('1.0.0-isolated-testnet')).toBe(true);
    expect(isIsolatedTestnetBuild('1.0.0')).toBe(false);
    expect(isIsolatedTestnetBuild(undefined)).toBe(false);
  });
});
