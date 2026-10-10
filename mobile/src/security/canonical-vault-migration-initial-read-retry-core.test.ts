import { describe, expect, it, vi } from 'vitest';

import { getCanonicalVaultMigrationInitialReadRetryState } from './canonical-vault-migration-initial-read-retry-core';

describe('canonical migration initial freshness retry coordinator', () => {
  it('invalidates the active attempt before requesting the next read sequence', () => {
    const invalidate = vi.fn();
    expect(getCanonicalVaultMigrationInitialReadRetryState({ invalidate }, 4)).toEqual({
      loaderState: { isRetrying: true, status: 'loading' },
      readSequence: 5,
    });
    expect(invalidate).toHaveBeenCalledOnce();
  });

  it('exposes only loading UI state and a numeric sequence', () => {
    const result = getCanonicalVaultMigrationInitialReadRetryState({ invalidate: vi.fn() }, 0);
    expect(Object.keys(result).sort()).toEqual(['loaderState', 'readSequence']);
    expect(JSON.stringify(result)).not.toContain('pin');
    expect(JSON.stringify(result)).not.toContain('snapshot');
  });
});
