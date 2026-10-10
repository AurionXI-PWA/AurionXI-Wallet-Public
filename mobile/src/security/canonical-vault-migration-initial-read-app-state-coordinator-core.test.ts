import { describe, expect, it } from 'vitest';

import { CanonicalVaultMigrationInitialReadAppStateCoordinator } from './canonical-vault-migration-initial-read-app-state-coordinator-core';

describe('canonical migration initial freshness app-state coordinator', () => {
  it('accepts one background and one following foreground transition', () => {
    const coordinator = new CanonicalVaultMigrationInitialReadAppStateCoordinator(true);
    expect(coordinator.background()).toBe(true);
    expect(coordinator.background()).toBe(false);
    expect(coordinator.foreground()).toBe(true);
    expect(coordinator.foreground()).toBe(false);
  });

  it('starts inactive and accepts only the first foreground transition', () => {
    const coordinator = new CanonicalVaultMigrationInitialReadAppStateCoordinator(false);
    expect(coordinator.background()).toBe(false);
    expect(coordinator.foreground()).toBe(true);
    expect(coordinator.foreground()).toBe(false);
  });

  it('contains no wallet, read, PIN, or snapshot state', () => {
    const coordinator = new CanonicalVaultMigrationInitialReadAppStateCoordinator(true);
    expect(Object.keys(coordinator)).toEqual([]);
    expect(JSON.stringify(coordinator)).not.toMatch(/pin|snapshot|vault|read/i);
  });
});
