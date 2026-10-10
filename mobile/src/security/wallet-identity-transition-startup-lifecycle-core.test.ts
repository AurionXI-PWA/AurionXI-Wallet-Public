import { describe, expect, it, vi } from 'vitest';

import type { VaultIdentityIntegrityAudit } from './vault-identity-integrity-core';
import type { WalletIdentityTransitionRecoveryResult } from './wallet-identity-transition-recovery-core';
import { runWalletIdentityTransitionStartupLifecycle } from './wallet-identity-transition-startup-lifecycle-core';

const cleanBound: VaultIdentityIntegrityAudit = { action: 'none', state: 'clean-bound' };

describe('wallet identity transition startup lifecycle', () => {
  it('runs one recovery decision before publishing a fresh identity audit', async () => {
    const calls: string[] = [];
    await expect(runWalletIdentityTransitionStartupLifecycle({
      auditIdentityIntegrity: vi.fn(async () => {
        calls.push('audit');
        return cleanBound;
      }),
      recoverOneTransitionStep: vi.fn(async (): Promise<WalletIdentityTransitionRecoveryResult> => {
        calls.push('recover');
        return { action: 'advance-durable-transition', state: 'recoverable' };
      }),
    })).resolves.toEqual(cleanBound);
    expect(calls).toEqual(['recover', 'audit']);
  });

  it.each([
    { action: 'none', state: 'clean' },
    { action: 'await-finalization', state: 'identity-verified' },
  ] as const)('still performs a fresh audit after non-mutating result %#', async (recovery) => {
    const auditIdentityIntegrity = vi.fn().mockResolvedValue(cleanBound);
    await runWalletIdentityTransitionStartupLifecycle({
      auditIdentityIntegrity,
      recoverOneTransitionStep: vi.fn().mockResolvedValue(recovery),
    });
    expect(auditIdentityIntegrity).toHaveBeenCalledTimes(1);
  });

  it('does not publish a later audit when recovery fails closed', async () => {
    const auditIdentityIntegrity = vi.fn().mockResolvedValue(cleanBound);
    await expect(runWalletIdentityTransitionStartupLifecycle({
      auditIdentityIntegrity,
      recoverOneTransitionStep: vi.fn().mockRejectedValue(new Error('transition inconsistent')),
    })).rejects.toThrow('transition inconsistent');
    expect(auditIdentityIntegrity).not.toHaveBeenCalled();
  });
});
