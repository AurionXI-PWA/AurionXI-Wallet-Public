import { describe, expect, it, vi } from 'vitest';

import { WalletIdentityTransitionController } from './wallet-identity-transition-controller-core';
import type { WalletIdentityTransitionPlan } from './wallet-identity-transition-policy';
import { createWalletIdentityRecord } from './wallet-identity-record-core';

const eligiblePlan: WalletIdentityTransitionPlan = {
  action: 'require-authenticated-transition',
  scope: {
    nextIdentity: createWalletIdentityRecord(
      '0x0000000000000000000000000000000000000002',
      '2026-08-09T00:00:00.000Z',
    ),
    previousIdentity: createWalletIdentityRecord(
      '0x0000000000000000000000000000000000000001',
      '2026-08-08T00:00:00.000Z',
    ),
    replacementTransactionId: '0123456789abcdef0123456789abcdef',
  },
  state: 'eligible',
};

describe('wallet identity transition controller', () => {
  it('blocks direct entry for a non-eligible fresh plan', () => {
    const controller = new WalletIdentityTransitionController({
      authenticatePin: vi.fn(),
    });
    expect(controller.begin({ action: 'fail-closed', state: 'inconsistent' })).toEqual({
      stage: 'blocked',
    });
  });

  it('advances only after successful PIN authentication', async () => {
    const authenticatePin = vi.fn().mockResolvedValue(undefined);
    const controller = new WalletIdentityTransitionController({ authenticatePin });
    expect(controller.begin(eligiblePlan).stage).toBe('awaiting-pin');
    await expect(controller.authenticatePin('123456', 1_000)).resolves.toEqual(
      expect.objectContaining({ stage: 'awaiting-confirmation' }),
    );
    expect(authenticatePin).toHaveBeenCalledWith('123456');
  });

  it('rejects a concurrent PIN authentication attempt', async () => {
    let release: (() => void) | undefined;
    const authenticatePin = vi.fn(() => new Promise<void>((resolve) => { release = resolve; }));
    const controller = new WalletIdentityTransitionController({ authenticatePin });
    controller.begin(eligiblePlan);
    const first = controller.authenticatePin('123456', 1_000);
    await expect(controller.authenticatePin('123456', 1_000)).rejects.toThrow(
      'already active',
    );
    release?.();
    await first;
  });

  it('rejects authentication completion after the controller is reset', async () => {
    let release: (() => void) | undefined;
    const authenticatePin = vi.fn(() => new Promise<void>((resolve) => { release = resolve; }));
    const controller = new WalletIdentityTransitionController({ authenticatePin });
    controller.begin(eligiblePlan);
    const pending = controller.authenticatePin('123456', 1_000);
    controller.reset();
    release?.();
    await expect(pending).rejects.toThrow('authorization changed');
    expect(controller.getState()).toEqual({ stage: 'idle' });
  });
});
