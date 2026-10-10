import { describe, expect, it } from 'vitest';

import type { CanonicalVaultMigrationPlan } from './canonical-vault-migration-policy';
import { decideCanonicalVaultMigrationStartup } from './canonical-vault-migration-startup-policy';

describe('canonical migration startup lifecycle policy foundation', () => {
  it('never begins a new migration intent automatically', () => {
    expect(decideCanonicalVaultMigrationStartup({
      action: 'record-intent',
      state: 'eligible',
    })).toEqual({
      action: 'await-explicit-start',
      migrationAction: 'record-intent',
      state: 'ready',
    });
  });

  it.each([
    { action: 'write-primary-copy', state: 'intent-recorded' },
    { action: 'mark-primary-written', state: 'primary-copy-present' },
    { action: 'activate-primary-pointer', state: 'primary-written' },
    { action: 'mark-primary-authoritative', state: 'primary-pointer-active' },
    { action: 'mark-candidate-removed', state: 'candidate-absent' },
    { action: 'mark-finalized', state: 'candidate-removed' },
  ] as const satisfies readonly CanonicalVaultMigrationPlan[])('permits at most one non-destructive recovery step for $action', (plan) => {
    expect(decideCanonicalVaultMigrationStartup(plan)).toEqual({
      action: 'recover-one-safe-step',
      migrationAction: plan.action,
      state: 'recoverable',
    });
  });

  it('requires explicit approval for the only irreversible migration action', () => {
    expect(decideCanonicalVaultMigrationStartup({
      action: 'remove-candidate',
      state: 'primary-authoritative',
    })).toEqual({
      action: 'require-explicit-candidate-removal',
      migrationAction: 'remove-candidate',
      state: 'approval-required',
    });
  });

  it('reports finalized state without recovery', () => {
    expect(decideCanonicalVaultMigrationStartup({
      action: 'complete',
      state: 'finalized',
    })).toEqual({ action: 'report-complete', state: 'finalized' });
  });

  it('reports inconsistent state as locked without recovery', () => {
    expect(decideCanonicalVaultMigrationStartup({
      action: 'fail-closed',
      state: 'inconsistent',
    })).toEqual({ action: 'report-locked', state: 'inconsistent' });
  });

  it('never classifies candidate removal as safe automatic recovery', () => {
    const plans: CanonicalVaultMigrationPlan[] = [
      { action: 'remove-candidate', state: 'primary-authoritative' },
      { action: 'fail-closed', state: 'inconsistent' },
      { action: 'complete', state: 'finalized' },
    ];
    expect(plans.map(decideCanonicalVaultMigrationStartup)).not.toContainEqual(
      expect.objectContaining({
        action: 'recover-one-safe-step',
        migrationAction: 'remove-candidate',
      }),
    );
  });
});
