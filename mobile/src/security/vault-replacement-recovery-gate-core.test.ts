import { describe, expect, it } from 'vitest';

import { getVaultReplacementRecoveryPresentation } from './vault-replacement-recovery-gate-core';

describe('vault replacement startup recovery presentation', () => {
  it('hides the gate only for a clean audit', () => {
    expect(getVaultReplacementRecoveryPresentation({ action: 'none', state: 'clean' })).toBeNull();
  });

  it('projects a verified finalized cleanup as complete without exposing another cleanup action', () => {
    expect(getVaultReplacementRecoveryPresentation(
      { action: 'await-cleanup', state: 'cleanup-pending' },
      { action: 'complete', state: 'finalized' },
    )).toEqual({
      body: 'The replacement wallet is active and retired wallet cleanup completed successfully.',
      blocksReplacement: false,
      severity: 'information',
      title: 'Secure cleanup complete',
    });
  });

  it('does not project completion from an inconsistent cleanup audit', () => {
    expect(getVaultReplacementRecoveryPresentation(
      { action: 'await-cleanup', state: 'cleanup-pending' },
      { action: 'fail-closed', state: 'inconsistent' },
    )).toEqual(expect.objectContaining({
      blocksReplacement: true,
      title: 'Secure cleanup is pending',
    }));
  });

  it.each([
    [{ action: 'resume-candidate', state: 'resumable' } as const, 'information'],
    [{ action: 'continue-promotion', state: 'promotion-recovery' } as const, 'information'],
    [{ action: 'await-cleanup', state: 'cleanup-pending' } as const, 'information'],
    [{ action: 'quarantine-candidate', state: 'candidate-without-journal' } as const, 'warning'],
    [{ action: 'remove-stale-journal', state: 'journal-without-candidate' } as const, 'warning'],
    [{ action: 'fail-closed', state: 'inconsistent' } as const, 'critical'],
    ['audit-error' as const, 'critical'],
  ])('blocks replacement for every non-clean state', (audit, severity) => {
    const result = getVaultReplacementRecoveryPresentation(audit);
    expect(result).toEqual(expect.objectContaining({ blocksReplacement: true, severity }));
    expect(result?.body).not.toMatch(/private key|recovery phrase|PIN/i);
  });
});
