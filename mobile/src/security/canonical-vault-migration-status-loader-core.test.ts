import { describe, expect, it, vi } from 'vitest';

import type { CanonicalVaultMigrationPlan } from './canonical-vault-migration-policy';
import { loadCanonicalVaultMigrationStatus } from './canonical-vault-migration-status-loader-core';

describe('read-only canonical migration status loader foundation', () => {
  it.each([
    [
      { action: 'record-intent', state: 'eligible' },
      'await-explicit-start',
      'Wallet storage optimization available',
    ],
    [
      { action: 'write-primary-copy', state: 'intent-recorded' },
      'recover-one-safe-step',
      'Wallet security recovery ready',
    ],
    [
      { action: 'remove-candidate', state: 'primary-authoritative' },
      'require-explicit-candidate-removal',
      'Secure cleanup approval required',
    ],
    [
      { action: 'complete', state: 'finalized' },
      'report-complete',
      'Wallet storage secured',
    ],
    [
      { action: 'fail-closed', state: 'inconsistent' },
      'report-locked',
      'Wallet storage transition locked',
    ],
  ] as const satisfies readonly (readonly [CanonicalVaultMigrationPlan, string, string])[])(
    'loads plan %s into a stable decision and presentation',
    async (plan, decisionAction, title) => {
      const readPlan = vi.fn().mockResolvedValue(plan);
      await expect(loadCanonicalVaultMigrationStatus(readPlan)).resolves.toEqual({
        decision: expect.objectContaining({ action: decisionAction }),
        presentation: expect.objectContaining({ title }),
      });
      expect(readPlan).toHaveBeenCalledTimes(1);
    },
  );

  it('propagates audit failure instead of inventing a partial ready state', async () => {
    const readPlan = vi.fn().mockRejectedValue(new Error('storage unavailable'));
    await expect(loadCanonicalVaultMigrationStatus(readPlan)).rejects.toThrow('storage unavailable');
    expect(readPlan).toHaveBeenCalledTimes(1);
  });

  it('accepts only one read dependency and has no executor callback', async () => {
    const readPlan = vi.fn().mockResolvedValue({ action: 'complete', state: 'finalized' });
    await loadCanonicalVaultMigrationStatus(readPlan);
    expect(readPlan).toHaveBeenCalledTimes(1);
    expect(readPlan).not.toHaveProperty('write');
    expect(readPlan).not.toHaveProperty('delete');
  });
});
