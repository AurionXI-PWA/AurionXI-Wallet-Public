import { describe, expect, it, vi } from 'vitest';

import {
  InvalidVaultPinError,
  PinRetryBlockedError,
  unlockWithPinRetry,
  type VaultUnlockGateDependencies,
} from './vault-unlock-gate';

function dependencies(): VaultUnlockGateDependencies {
  return {
    authenticate: vi.fn().mockResolvedValue(new Uint8Array([1])),
    clearRetryState: vi.fn().mockResolvedValue(undefined),
    getRetryGate: vi.fn().mockResolvedValue({ allowed: true, failedAttempts: 0 }),
    isAuthenticationFailure: (error) => error instanceof TypeError,
    registerFailure: vi.fn().mockResolvedValue({ allowed: true, failedAttempts: 1 }),
  };
}

describe('vault unlock retry gate', () => {
  it('does not authenticate while a persisted cooldown is active', async () => {
    const deps = dependencies();
    vi.mocked(deps.getRetryGate).mockResolvedValue({
      allowed: false,
      blockedUntil: 31_000,
      failedAttempts: 5,
      reason: 'cooldown',
      retryAfterMs: 30_000,
    });
    await expect(unlockWithPinRetry('482905', deps, 1_000)).rejects.toBeInstanceOf(
      PinRetryBlockedError
    );
    expect(deps.authenticate).not.toHaveBeenCalled();
  });

  it('persists a failure before returning a generic invalid-PIN error', async () => {
    const deps = dependencies();
    vi.mocked(deps.authenticate).mockRejectedValue(new TypeError('native auth failed'));
    await expect(unlockWithPinRetry('482905', deps, 1_000)).rejects.toBeInstanceOf(
      InvalidVaultPinError
    );
    expect(deps.registerFailure).toHaveBeenCalledWith(1_000);
    expect(deps.clearRetryState).not.toHaveBeenCalled();
  });

  it('clears persisted failures before returning plaintext', async () => {
    const deps = dependencies();
    await expect(unlockWithPinRetry('482905', deps, 1_000)).resolves.toEqual(
      new Uint8Array([1])
    );
    expect(deps.clearRetryState).toHaveBeenCalledOnce();
  });

  it('does not count storage/system failures as wrong PINs', async () => {
    const deps = dependencies();
    vi.mocked(deps.authenticate).mockRejectedValue(new Error('storage unavailable'));
    await expect(unlockWithPinRetry('482905', deps, 1_000)).rejects.toThrow(
      'storage unavailable'
    );
    expect(deps.registerFailure).not.toHaveBeenCalled();
  });
});
