import { describe, expect, it } from 'vitest';

import { isCanonicalVaultMigrationInitialReadAppActive } from './canonical-vault-migration-initial-read-cold-start-core';

describe('canonical migration initial freshness cold-start state', () => {
  it.each(['active', 'background', 'inactive', 'unknown', null])(
    'accepts a storage-safety read only for exact active state: %s',
    (appState) => {
      expect(isCanonicalVaultMigrationInitialReadAppActive(appState)).toBe(appState === 'active');
    },
  );

  it('has no wallet, PIN, snapshot, or storage input', () => {
    expect(isCanonicalVaultMigrationInitialReadAppActive.length).toBe(1);
    expect(isCanonicalVaultMigrationInitialReadAppActive('active')).toBe(true);
  });
});
