import { describe, expect, it, vi } from 'vitest';

import type { CanonicalVaultMigrationPlan } from './canonical-vault-migration-policy';
import {
  recoverOneCanonicalVaultMigrationStep,
  type CanonicalVaultMigrationRecoveryCoordinatorDependencies,
} from './canonical-vault-migration-recovery-coordinator-core';

const transitions = [
  [{ action: 'record-intent', state: 'eligible' }, { action: 'write-primary-copy', state: 'intent-recorded' }],
  [{ action: 'write-primary-copy', state: 'intent-recorded' }, { action: 'mark-primary-written', state: 'primary-copy-present' }],
  [{ action: 'mark-primary-written', state: 'primary-copy-present' }, { action: 'activate-primary-pointer', state: 'primary-written' }],
  [{ action: 'activate-primary-pointer', state: 'primary-written' }, { action: 'mark-primary-authoritative', state: 'primary-pointer-active' }],
  [{ action: 'mark-primary-authoritative', state: 'primary-pointer-active' }, { action: 'remove-candidate', state: 'primary-authoritative' }],
  [{ action: 'remove-candidate', state: 'primary-authoritative' }, { action: 'mark-candidate-removed', state: 'candidate-absent' }],
  [{ action: 'mark-candidate-removed', state: 'candidate-absent' }, { action: 'mark-finalized', state: 'candidate-removed' }],
  [{ action: 'mark-finalized', state: 'candidate-removed' }, { action: 'complete', state: 'finalized' }],
] as const satisfies readonly (readonly [CanonicalVaultMigrationPlan, CanonicalVaultMigrationPlan])[];

function dependencies(
  plans: CanonicalVaultMigrationPlan[],
): CanonicalVaultMigrationRecoveryCoordinatorDependencies {
  return {
    activatePrimaryPointer: vi.fn().mockResolvedValue(undefined),
    markCandidateRemoved: vi.fn().mockResolvedValue(undefined),
    markFinalized: vi.fn().mockResolvedValue(undefined),
    markPrimaryAuthoritative: vi.fn().mockResolvedValue(undefined),
    markPrimaryWritten: vi.fn().mockResolvedValue(undefined),
    readPlan: vi.fn().mockImplementation(async () => {
      const plan = plans.shift();
      if (!plan) throw new Error('missing plan');
      return plan;
    }),
    recordIntent: vi.fn().mockResolvedValue(undefined),
    removeCandidate: vi.fn().mockResolvedValue(undefined),
    writePrimaryCopy: vi.fn().mockResolvedValue(undefined),
  };
}

const callbackFor = {
  'activate-primary-pointer': 'activatePrimaryPointer',
  'mark-candidate-removed': 'markCandidateRemoved',
  'mark-finalized': 'markFinalized',
  'mark-primary-authoritative': 'markPrimaryAuthoritative',
  'mark-primary-written': 'markPrimaryWritten',
  'record-intent': 'recordIntent',
  'remove-candidate': 'removeCandidate',
  'write-primary-copy': 'writePrimaryCopy',
} as const;

describe('canonical migration one-step recovery coordinator foundation', () => {
  it.each(transitions)('dispatches only one %s step and verifies its successor', async (current, next) => {
    const deps = dependencies([current, next]);
    await expect(recoverOneCanonicalVaultMigrationStep(deps)).resolves.toEqual({
      action: 'executed-one-step',
      step: current.action,
    });
    const callback = callbackFor[current.action];
    expect(deps[callback]).toHaveBeenCalledTimes(1);
    const totalCalls = Object.values(callbackFor).reduce(
      (sum, key) => sum + vi.mocked(deps[key]).mock.calls.length,
      0,
    );
    expect(totalCalls).toBe(1);
    expect(deps.readPlan).toHaveBeenCalledTimes(2);
  });

  it('does nothing when a fresh audit is already finalized', async () => {
    const deps = dependencies([{ action: 'complete', state: 'finalized' }]);
    await expect(recoverOneCanonicalVaultMigrationStep(deps)).resolves.toEqual({
      action: 'complete',
      state: 'finalized',
    });
    expect(deps.readPlan).toHaveBeenCalledTimes(1);
    for (const key of Object.values(callbackFor)) expect(deps[key]).not.toHaveBeenCalled();
  });

  it('fails closed without dispatch when the audit is inconsistent', async () => {
    const deps = dependencies([{ action: 'fail-closed', state: 'inconsistent' }]);
    await expect(recoverOneCanonicalVaultMigrationStep(deps)).rejects.toThrow('failed closed');
    for (const key of Object.values(callbackFor)) expect(deps[key]).not.toHaveBeenCalled();
  });

  it('rejects a callback result that does not reach the exact successor', async () => {
    const deps = dependencies([
      { action: 'write-primary-copy', state: 'intent-recorded' },
      { action: 'write-primary-copy', state: 'intent-recorded' },
    ]);
    await expect(recoverOneCanonicalVaultMigrationStep(deps)).rejects.toThrow(
      'next-step verification',
    );
    expect(deps.writePrimaryCopy).toHaveBeenCalledTimes(1);
  });

  it('has no startup, timer, loop, or storage dependency', () => {
    expect(Object.keys(dependencies([])).sort()).toEqual([
      'activatePrimaryPointer',
      'markCandidateRemoved',
      'markFinalized',
      'markPrimaryAuthoritative',
      'markPrimaryWritten',
      'readPlan',
      'recordIntent',
      'removeCandidate',
      'writePrimaryCopy',
    ]);
  });
});
