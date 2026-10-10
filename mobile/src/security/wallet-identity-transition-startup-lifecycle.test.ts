import { describe, expect, it, vi } from 'vitest';

const { auditStoredVaultIdentityIntegrity, recoverOneStartupWalletIdentityTransitionStep } = vi.hoisted(() => ({
  auditStoredVaultIdentityIntegrity: vi.fn(),
  recoverOneStartupWalletIdentityTransitionStep: vi.fn(),
}));

vi.mock('./vault-identity-integrity', () => ({ auditStoredVaultIdentityIntegrity }));
vi.mock('./wallet-identity-transition-recovery', () => ({
  recoverOneStartupWalletIdentityTransitionStep,
}));

// The module under test must load after its dependencies are mocked.
// eslint-disable-next-line import/first
import { runStoredWalletIdentityTransitionStartupLifecycle } from './wallet-identity-transition-startup-lifecycle';

describe('stored wallet identity transition startup lifecycle', () => {
  it('shares one process-lifetime recovery promise across simultaneous callers', async () => {
    recoverOneStartupWalletIdentityTransitionStep.mockResolvedValue({
      action: 'none',
      state: 'clean',
    });
    auditStoredVaultIdentityIntegrity.mockResolvedValue({
      action: 'none',
      state: 'clean-bound',
    });
    const [first, second] = await Promise.all([
      runStoredWalletIdentityTransitionStartupLifecycle(),
      runStoredWalletIdentityTransitionStartupLifecycle(),
    ]);
    expect(first).toEqual({ action: 'none', state: 'clean-bound' });
    expect(second).toBe(first);
    expect(recoverOneStartupWalletIdentityTransitionStep).toHaveBeenCalledTimes(1);
    expect(auditStoredVaultIdentityIntegrity).toHaveBeenCalledTimes(1);
  });
});
