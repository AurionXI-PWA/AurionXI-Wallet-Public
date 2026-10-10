import { describe, expect, it, vi } from 'vitest';

import { RetiredPrimaryCleanupController } from './retired-primary-cleanup-controller-core';
import type { RetiredPrimaryCleanupPlan } from './retired-primary-cleanup-policy';
import { createWalletIdentityRecord } from './wallet-identity-record-core';

const eligiblePlan: RetiredPrimaryCleanupPlan = {
  action: 'require-authenticated-cleanup',
  scope: {
    activeIdentity: createWalletIdentityRecord(
      '0x0000000000000000000000000000000000000002',
      '2026-08-09T00:00:00.000Z',
    ),
    replacementTransactionId: '0123456789abcdef0123456789abcdef',
    retiredIdentity: createWalletIdentityRecord(
      '0x0000000000000000000000000000000000000001',
      '2026-08-08T00:00:00.000Z',
    ),
    retiredPrimaryStatus: 'present',
  },
  state: 'eligible',
};

describe('retired primary cleanup controller', () => {
  it('blocks direct entry for a non-eligible fresh plan', () => {
    const controller = new RetiredPrimaryCleanupController({ authenticatePin: vi.fn() });
    expect(controller.begin({ action: 'fail-closed', state: 'inconsistent' })).toEqual({ stage: 'blocked' });
  });

  it('advances only after successful active-wallet PIN authentication', async () => {
    const authenticatePin = vi.fn().mockResolvedValue(undefined);
    const controller = new RetiredPrimaryCleanupController({ authenticatePin });
    expect(controller.begin(eligiblePlan).stage).toBe('awaiting-pin');
    await expect(controller.authenticatePin('123456', 1_000)).resolves.toEqual(
      expect.objectContaining({ stage: 'awaiting-confirmation' }),
    );
    expect(authenticatePin).toHaveBeenCalledWith('123456');
  });

  it('rejects a concurrent PIN authentication attempt', async () => {
    let release: (() => void) | undefined;
    const authenticatePin = vi.fn(() => new Promise<void>((resolve) => { release = resolve; }));
    const controller = new RetiredPrimaryCleanupController({ authenticatePin });
    controller.begin(eligiblePlan);
    const first = controller.authenticatePin('123456', 1_000);
    await expect(controller.authenticatePin('123456', 1_000)).rejects.toThrow('already active');
    release?.();
    await first;
  });

  it('rejects authentication completion after controller reset', async () => {
    let release: (() => void) | undefined;
    const authenticatePin = vi.fn(() => new Promise<void>((resolve) => { release = resolve; }));
    const controller = new RetiredPrimaryCleanupController({ authenticatePin });
    controller.begin(eligiblePlan);
    const pending = controller.authenticatePin('123456', 1_000);
    controller.reset();
    release?.();
    await expect(pending).rejects.toThrow('authorization changed');
    expect(controller.getState()).toEqual({ stage: 'idle' });
  });
});
