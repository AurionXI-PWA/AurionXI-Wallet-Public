import { describe, expect, it, vi } from 'vitest';

import { createCanonicalVaultMigrationInitialReadLifecycleDisposer } from './canonical-vault-migration-initial-read-lifecycle-disposer-core';

describe('canonical migration initial freshness lifecycle disposer', () => {
  it('removes one subscription at most once', () => {
    const removeSubscription = vi.fn();
    const disposer = createCanonicalVaultMigrationInitialReadLifecycleDisposer(removeSubscription);
    disposer.dispose();
    disposer.dispose();
    expect(removeSubscription).toHaveBeenCalledOnce();
  });

  it('does not expose a subscription, PIN, snapshot, or vault value', () => {
    const disposer = createCanonicalVaultMigrationInitialReadLifecycleDisposer(vi.fn());
    expect(Object.keys(disposer)).toEqual(['dispose']);
    expect(JSON.stringify(disposer)).not.toMatch(/pin|snapshot|vault|subscription/i);
  });
});
