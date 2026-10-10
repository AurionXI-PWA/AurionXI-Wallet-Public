import { describe, expect, it } from 'vitest';

import { CanonicalVaultMigrationInitialReadRetryRequestGate } from './canonical-vault-migration-initial-read-retry-request-gate-core';

describe('canonical migration initial freshness retry request gate', () => {
  it('allows one retry request until the replacement read cycle starts', () => {
    const gate = new CanonicalVaultMigrationInitialReadRetryRequestGate();
    expect(gate.tryBegin()).toBe(true);
    expect(gate.tryBegin()).toBe(false);
    gate.release();
    expect(gate.tryBegin()).toBe(true);
  });

  it('does not expose request contents or wallet data', () => {
    const gate = new CanonicalVaultMigrationInitialReadRetryRequestGate();
    expect(Object.keys(gate)).toEqual([]);
    expect(JSON.stringify(gate)).not.toContain('pin');
    expect(JSON.stringify(gate)).not.toContain('snapshot');
  });
});
