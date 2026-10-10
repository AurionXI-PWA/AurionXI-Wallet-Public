import { describe, expect, it, vi } from 'vitest';

import { handleCanonicalVaultMigrationStartEvent } from './canonical-vault-migration-start-event-adapter';

const viewState = {
  busy: false,
  error: null,
  screen: {
    body: 'Ready.',
    input: 'none' as const,
    primaryAction: 'submit-authorized-start' as const,
    primaryButton: { enabled: false as const, label: 'Start optimization' },
    secureEntry: false,
    severity: 'success' as const,
    title: 'Optimization authorized',
  },
};

function controller() {
  return {
    confirm: vi.fn().mockReturnValue(viewState),
    getState: vi.fn().mockReturnValue(viewState),
    verifyPin: vi.fn().mockResolvedValue(viewState),
  };
}

describe('canonical migration local view-controller event adapter foundation', () => {
  it('routes an ephemeral PIN request only to view-controller verification', async () => {
    const target = controller();
    await expect(handleCanonicalVaultMigrationStartEvent(target, {
      pin: '123456',
      type: 'VERIFY_PIN_REQUESTED',
    }, 1_000)).resolves.toEqual({ action: 'view-state-updated', state: viewState });
    expect(target.verifyPin).toHaveBeenCalledWith('123456', 1_000);
    expect(target.confirm).not.toHaveBeenCalled();
    expect(target.getState).not.toHaveBeenCalled();
  });

  it('routes exact confirmation only to the local view-controller', async () => {
    const target = controller();
    await expect(handleCanonicalVaultMigrationStartEvent(target, {
      confirmation: 'OPTIMIZE WALLET STORAGE',
      type: 'CONFIRM_AUTHORIZATION_REQUESTED',
    }, 1_001)).resolves.toEqual({ action: 'view-state-updated', state: viewState });
    expect(target.confirm).toHaveBeenCalledWith('OPTIMIZE WALLET STORAGE', 1_001);
    expect(target.verifyPin).not.toHaveBeenCalled();
  });

  it('reports authorized start without invoking PIN or confirmation methods', async () => {
    const target = controller();
    await expect(handleCanonicalVaultMigrationStartEvent(target, {
      type: 'AUTHORIZED_START_REQUESTED',
    }, 1_002)).resolves.toEqual({ action: 'authorized-start-reported', state: viewState });
    expect(target.getState).toHaveBeenCalledOnce();
    expect(target.verifyPin).not.toHaveBeenCalled();
    expect(target.confirm).not.toHaveBeenCalled();
  });

  it('does not return the ephemeral PIN or confirmation value', async () => {
    const target = controller();
    const pinResult = await handleCanonicalVaultMigrationStartEvent(target, {
      pin: '123456',
      type: 'VERIFY_PIN_REQUESTED',
    });
    const confirmationResult = await handleCanonicalVaultMigrationStartEvent(target, {
      confirmation: 'OPTIMIZE WALLET STORAGE',
      type: 'CONFIRM_AUTHORIZATION_REQUESTED',
    });
    expect(JSON.stringify(pinResult)).not.toContain('123456');
    expect(JSON.stringify(confirmationResult)).not.toContain('OPTIMIZE WALLET STORAGE');
  });

  it('accepts no router or intent executor dependency', () => {
    expect(handleCanonicalVaultMigrationStartEvent.length).toBe(2);
    expect(controller()).not.toHaveProperty('navigate');
    expect(controller()).not.toHaveProperty('executeIntent');
  });
});
