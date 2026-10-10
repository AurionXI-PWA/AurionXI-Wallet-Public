import { describe, expect, it, vi } from 'vitest';

import type { VaultReplacementRecoveryAudit } from './vault-replacement-journal-core';
import type { VaultReplacementPromotionRecoveryResult } from './vault-replacement-promotion-recovery-core';
import { runVaultReplacementStartupLifecycle } from './vault-replacement-startup-lifecycle-core';

const cleanAudit: VaultReplacementRecoveryAudit = { action: 'none', state: 'clean' };

describe('vault replacement startup lifecycle', () => {
  it('runs at most one recovery call before a fresh audit', async () => {
    const calls: string[] = [];
    const result = await runVaultReplacementStartupLifecycle({
      auditRecovery: vi.fn(async () => {
        calls.push('audit');
        return cleanAudit;
      }),
      recoverOnePromotionStep: vi.fn(async (): Promise<VaultReplacementPromotionRecoveryResult> => {
        calls.push('recover');
        return { action: 'advance-durable-promotion', state: 'recoverable' };
      }),
    });
    expect(result).toEqual(cleanAudit);
    expect(calls).toEqual(['recover', 'audit']);
  });

  it('audits non-mutating pre-intent and cleanup results', async () => {
    for (const recovery of [
      { action: 'await-authenticated-promotion', state: 'pre-intent' },
      { action: 'await-authenticated-cleanup', state: 'cleanup-pending' },
    ] as const) {
      const auditRecovery = vi.fn().mockResolvedValue(cleanAudit);
      await runVaultReplacementStartupLifecycle({
        auditRecovery,
        recoverOnePromotionStep: vi.fn().mockResolvedValue(recovery),
      });
      expect(auditRecovery).toHaveBeenCalledTimes(1);
    }
  });

  it('fails closed without presenting a later audit as safe', async () => {
    const auditRecovery = vi.fn().mockResolvedValue(cleanAudit);
    await expect(runVaultReplacementStartupLifecycle({
      auditRecovery,
      recoverOnePromotionStep: vi.fn().mockResolvedValue({
        action: 'fail-closed',
        state: 'inconsistent',
      }),
    })).rejects.toThrow('failed closed');
    expect(auditRecovery).not.toHaveBeenCalled();
  });
});
