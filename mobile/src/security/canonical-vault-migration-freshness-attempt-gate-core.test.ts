import { describe, expect, it } from 'vitest';

import { CanonicalVaultMigrationFreshnessAttemptGate } from './canonical-vault-migration-freshness-attempt-gate-core';

describe('canonical migration freshness read attempt generation foundation', () => {
  it('invalidates an older read when a newer attempt starts', () => {
    const gate = new CanonicalVaultMigrationFreshnessAttemptGate();
    const first = gate.begin();
    const second = gate.begin();
    expect(first.isCurrent()).toBe(false);
    expect(second.isCurrent()).toBe(true);
  });

  it('retires the active attempt without affecting a later attempt', () => {
    const gate = new CanonicalVaultMigrationFreshnessAttemptGate();
    const first = gate.begin();
    first.retire();
    expect(first.isCurrent()).toBe(false);
    const second = gate.begin();
    first.retire();
    expect(second.isCurrent()).toBe(true);
  });

  it('invalidates the active attempt before a replacement read begins', () => {
    const gate = new CanonicalVaultMigrationFreshnessAttemptGate();
    const active = gate.begin();
    gate.invalidate();
    expect(active.isCurrent()).toBe(false);
    expect(gate.begin().isCurrent()).toBe(true);
  });

  it('exposes no snapshot, reader, PIN, router, or storage value', () => {
    const attempt = new CanonicalVaultMigrationFreshnessAttemptGate().begin();
    expect(Object.keys(attempt).sort()).toEqual(['isCurrent', 'retire']);
    expect(JSON.stringify(attempt)).not.toContain('snapshot');
    expect(JSON.stringify(attempt)).not.toContain('PIN');
  });
});
