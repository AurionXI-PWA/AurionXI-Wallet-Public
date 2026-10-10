import { describe, expect, it, vi } from 'vitest';

import type { CanonicalVaultMigrationSnapshot } from './canonical-vault-migration-policy';
import type { CanonicalVaultMigrationStartAuthorization } from './canonical-vault-migration-start-authorization';
import { CanonicalVaultMigrationStartViewController } from './canonical-vault-migration-start-view-controller';

function harness() {
  let state: CanonicalVaultMigrationStartAuthorization = { stage: 'idle' };
  const controller = {
    authenticatePin: vi.fn().mockImplementation(async () => {
      state = { authorizationExpiresAt: 61_000, scope: undefined, stage: 'awaiting-confirmation' };
      return state;
    }),
    begin: vi.fn().mockImplementation(() => {
      state = { stage: 'awaiting-pin' };
      return state;
    }),
    checkExpiry: vi.fn().mockImplementation(() => state),
    confirm: vi.fn().mockImplementation((confirmation: string) => {
      if (confirmation === 'OPTIMIZE WALLET STORAGE') state = { ...state, stage: 'authorized' };
      return state;
    }),
    getState: vi.fn().mockImplementation(() => state),
    reset: vi.fn().mockImplementation(() => { state = { stage: 'idle' }; }),
  };
  return {
    controller,
    view: new CanonicalVaultMigrationStartViewController(controller),
  };
}

describe('canonical migration start local view-controller foundation', () => {
  it('projects controller stages into disabled screen models', () => {
    const test = harness();
    expect(test.view.getState().screen.title).toBe('Wallet storage optimization');
    const state = test.view.begin({} as CanonicalVaultMigrationSnapshot);
    expect(state.screen).toEqual(expect.objectContaining({
      inputLabel: 'Wallet PIN',
      secureEntry: true,
      title: 'Verify wallet access',
    }));
    expect(state.screen.primaryButton?.enabled).toBe(false);
  });

  it('passes PIN directly to the controller without retaining it', async () => {
    const test = harness();
    test.view.begin({} as CanonicalVaultMigrationSnapshot);
    const result = await test.view.verifyPin('123456', 1_000);
    expect(test.controller.authenticatePin).toHaveBeenCalledWith('123456', 1_000);
    expect(result.screen.title).toBe('Confirm storage optimization');
    expect(JSON.stringify(test.view.getState())).not.toContain('123456');
  });

  it('exposes busy state while PIN verification is pending and blocks concurrency', async () => {
    const test = harness();
    let release: (() => void) | undefined;
    test.controller.authenticatePin.mockImplementationOnce(() => new Promise((resolve) => { release = () => resolve(undefined); }));
    test.view.begin({} as CanonicalVaultMigrationSnapshot);
    const pending = test.view.verifyPin('123456', 1_000);
    expect(test.view.getState().busy).toBe(true);
    await expect(test.view.verifyPin('123456', 1_000)).rejects.toThrow('busy');
    release?.();
    await pending;
    expect(test.view.getState().busy).toBe(false);
  });

  it('shows generic PIN failure without retaining the attempted PIN', async () => {
    const test = harness();
    test.controller.authenticatePin.mockRejectedValueOnce(new Error('wrong PIN'));
    test.view.begin({} as CanonicalVaultMigrationSnapshot);
    await expect(test.view.verifyPin('000000', 1_000)).rejects.toThrow('wrong PIN');
    expect(test.view.getState().error).toBe('PIN verification did not complete.');
    expect(JSON.stringify(test.view.getState())).not.toContain('000000');
  });

  it('projects exact confirmation success and clears state on reset', async () => {
    const test = harness();
    test.view.begin({} as CanonicalVaultMigrationSnapshot);
    await test.view.verifyPin('123456', 1_000);
    const wrong = test.view.confirm('wrong', 1_001);
    expect(wrong.error).toBe('Type the confirmation phrase exactly as shown.');
    const authorized = test.view.confirm('OPTIMIZE WALLET STORAGE', 1_002);
    expect(authorized.screen.title).toBe('Optimization authorized');
    expect(test.view.reset()).toEqual(expect.objectContaining({ busy: false, error: null }));
    expect(test.view.getState().screen.title).toBe('Wallet storage optimization');
  });

  it('contains no router, verifier implementation, or intent executor dependency', () => {
    const test = harness();
    expect(Object.keys(test.view)).toEqual([]);
    expect(test.view.getState()).not.toHaveProperty('route');
    expect(test.view.getState()).not.toHaveProperty('executeIntent');
  });
});
