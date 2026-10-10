import { describe, expect, it, vi } from 'vitest';

import type { VaultV3Envelope } from './vault-envelope-v3';
import { VaultIdentityMigrationController } from './vault-identity-migration-controller-core';

const vault = {
  createdAt: '2026-08-09T00:00:00.000Z',
  format: 'aurionxi-vault-v3',
  payloadCiphertext: 'C'.repeat(40),
  pin: { algorithm: 'argon2id', saltHex: '1'.repeat(32), wrappedVaultKey: 'D'.repeat(40) },
  publicAddress: '0x0000000000000000000000000000000000000001',
} satisfies VaultV3Envelope;
const missingIdentity = { action: 'require-pin-migration', state: 'missing-identity' } as const;

function setup() {
  const dependencies = { authenticatePin: vi.fn().mockResolvedValue(undefined) };
  return { controller: new VaultIdentityMigrationController(dependencies), dependencies };
}

describe('wallet identity migration controller', () => {
  it('delegates to retry-protected PIN authentication and advances only after success', async () => {
    const { controller, dependencies } = setup();
    controller.begin(missingIdentity, vault);
    await expect(controller.authenticatePin('246810', 100)).resolves.toEqual(
      expect.objectContaining({ stage: 'awaiting-confirmation' }),
    );
    expect(dependencies.authenticatePin).toHaveBeenCalledWith('246810');
    expect(JSON.stringify(controller.getState())).not.toContain('246810');
  });

  it('does not advance after failed PIN authentication', async () => {
    const { controller, dependencies } = setup();
    dependencies.authenticatePin.mockRejectedValue(new Error('invalid'));
    controller.begin(missingIdentity, vault);
    await expect(controller.authenticatePin('000000', 100)).rejects.toThrow('invalid');
    expect(controller.getState().stage).toBe('awaiting-pin');
  });

  it('rejects authentication before an eligible migration begins', async () => {
    const { controller, dependencies } = setup();
    await expect(controller.authenticatePin('246810', 100)).rejects.toThrow('not allowed');
    expect(dependencies.authenticatePin).not.toHaveBeenCalled();
  });

  it('blocks overlapping authentication attempts', async () => {
    let release: (() => void) | undefined;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    const { controller, dependencies } = setup();
    dependencies.authenticatePin.mockReturnValue(pending);
    controller.begin(missingIdentity, vault);
    const first = controller.authenticatePin('246810', 100);
    await expect(controller.authenticatePin('246810', 101)).rejects.toThrow('already active');
    release?.();
    await first;
  });

  it('fails closed when reset occurs during authentication', async () => {
    let release: (() => void) | undefined;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    const { controller, dependencies } = setup();
    dependencies.authenticatePin.mockReturnValue(pending);
    controller.begin(missingIdentity, vault);
    const authentication = controller.authenticatePin('246810', 100);
    controller.reset();
    release?.();
    await expect(authentication).rejects.toThrow('changed during authentication');
    expect(controller.getState().stage).toBe('idle');
  });

  it('grants bound write permission only after exact confirmation', async () => {
    const { controller } = setup();
    controller.begin(missingIdentity, vault);
    await controller.authenticatePin('246810', 100);
    controller.confirm('migrate', 101);
    expect(controller.canWrite(missingIdentity, vault, 101)).toBe(false);
    controller.confirm('MIGRATE', 102);
    expect(controller.canWrite(missingIdentity, vault, 102)).toBe(true);
    expect(controller.canWrite(missingIdentity, { ...vault, createdAt: '2026-08-09T00:00:01.000Z' }, 102)).toBe(false);
  });

  it('expiry checking and reset remove authority', async () => {
    const { controller } = setup();
    controller.begin(missingIdentity, vault);
    await controller.authenticatePin('246810', 100);
    controller.confirm('MIGRATE', 101);
    controller.checkExpiry(60_100);
    expect(controller.getState().stage).toBe('idle');
    expect(controller.canWrite(missingIdentity, vault, 60_100)).toBe(false);
  });
});
