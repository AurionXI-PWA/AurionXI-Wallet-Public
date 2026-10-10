import { describe, expect, it, vi } from 'vitest';

import type { CanonicalVaultMigrationPlan } from './canonical-vault-migration-policy';
import {
  runCanonicalVaultMigrationStartupLifecycle,
  type CanonicalVaultMigrationStartupLifecycleDependencies,
} from './canonical-vault-migration-startup-lifecycle-core';

const safeTransitions = [
  [
    { action: 'write-primary-copy', state: 'intent-recorded' },
    { action: 'mark-primary-written', state: 'primary-copy-present' },
    { action: 'recover-one-safe-step', migrationAction: 'mark-primary-written', state: 'recoverable' },
  ],
  [
    { action: 'mark-primary-written', state: 'primary-copy-present' },
    { action: 'activate-primary-pointer', state: 'primary-written' },
    { action: 'recover-one-safe-step', migrationAction: 'activate-primary-pointer', state: 'recoverable' },
  ],
  [
    { action: 'activate-primary-pointer', state: 'primary-written' },
    { action: 'mark-primary-authoritative', state: 'primary-pointer-active' },
    { action: 'recover-one-safe-step', migrationAction: 'mark-primary-authoritative', state: 'recoverable' },
  ],
  [
    { action: 'mark-primary-authoritative', state: 'primary-pointer-active' },
    { action: 'remove-candidate', state: 'primary-authoritative' },
    { action: 'require-explicit-candidate-removal', migrationAction: 'remove-candidate', state: 'approval-required' },
  ],
  [
    { action: 'mark-candidate-removed', state: 'candidate-absent' },
    { action: 'mark-finalized', state: 'candidate-removed' },
    { action: 'recover-one-safe-step', migrationAction: 'mark-finalized', state: 'recoverable' },
  ],
  [
    { action: 'mark-finalized', state: 'candidate-removed' },
    { action: 'complete', state: 'finalized' },
    { action: 'report-complete', state: 'finalized' },
  ],
] as const satisfies readonly (readonly [
  CanonicalVaultMigrationPlan,
  CanonicalVaultMigrationPlan,
  object,
])[];

function dependencies(plans: CanonicalVaultMigrationPlan[]): CanonicalVaultMigrationStartupLifecycleDependencies {
  return {
    readPlan: vi.fn().mockImplementation(async () => {
      const plan = plans.shift();
      if (!plan) throw new Error('missing plan');
      return plan;
    }),
    recoverOneSafeStep: vi.fn().mockResolvedValue(undefined),
  };
}

describe('canonical migration startup lifecycle core foundation', () => {
  it.each(safeTransitions)('runs one safe %s recovery and stops at its successor', async (current, next, nextDecision) => {
    const deps = dependencies([current, next]);
    await expect(runCanonicalVaultMigrationStartupLifecycle(deps)).resolves.toEqual({
      action: 'recovered-one-safe-step',
      next: nextDecision,
      step: current.action,
    });
    expect(deps.recoverOneSafeStep).toHaveBeenCalledWith(current.action);
    expect(deps.recoverOneSafeStep).toHaveBeenCalledTimes(1);
    expect(deps.readPlan).toHaveBeenCalledTimes(2);
  });

  it.each([
    [
      { action: 'record-intent', state: 'eligible' } as const,
      { action: 'await-explicit-start', migrationAction: 'record-intent', state: 'ready' } as const,
    ],
    [
      { action: 'remove-candidate', state: 'primary-authoritative' } as const,
      { action: 'require-explicit-candidate-removal', migrationAction: 'remove-candidate', state: 'approval-required' } as const,
    ],
    [
      { action: 'complete', state: 'finalized' } as const,
      { action: 'report-complete', state: 'finalized' } as const,
    ],
    [
      { action: 'fail-closed', state: 'inconsistent' } as const,
      { action: 'report-locked', state: 'inconsistent' } as const,
    ],
  ])('reports boundary plan %s without invoking recovery', async (plan, expected) => {
    const deps = dependencies([plan]);
    await expect(runCanonicalVaultMigrationStartupLifecycle(deps)).resolves.toEqual(expected);
    expect(deps.recoverOneSafeStep).not.toHaveBeenCalled();
    expect(deps.readPlan).toHaveBeenCalledTimes(1);
  });

  it('rejects when one safe callback does not reach its exact successor', async () => {
    const deps = dependencies([
      { action: 'write-primary-copy', state: 'intent-recorded' },
      { action: 'write-primary-copy', state: 'intent-recorded' },
    ]);
    await expect(runCanonicalVaultMigrationStartupLifecycle(deps)).rejects.toThrow(
      'successor verification',
    );
    expect(deps.recoverOneSafeStep).toHaveBeenCalledTimes(1);
  });

  it('exposes neither new-intent nor candidate-removal callbacks', () => {
    expect(Object.keys(dependencies([])).sort()).toEqual(['readPlan', 'recoverOneSafeStep']);
  });
});
