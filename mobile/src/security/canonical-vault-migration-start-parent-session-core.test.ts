import { describe, expect, it, vi } from 'vitest';

import type { CanonicalVaultMigrationSnapshot } from './canonical-vault-migration-policy';
import { CanonicalVaultMigrationStartParentSession } from './canonical-vault-migration-start-parent-session-core';

const snapshot = {} as CanonicalVaultMigrationSnapshot;
const state = {
  busy: false,
  error: null,
  screen: {
    body: 'Ready.',
    input: 'none' as const,
    primaryAction: 'none' as const,
    secureEntry: false,
    severity: 'neutral' as const,
    title: 'Wallet storage optimization',
  },
};
const authorizedState = {
  ...state,
  screen: {
    ...state.screen,
    primaryAction: 'submit-authorized-start' as const,
    primaryButton: { enabled: false as const, label: 'Start optimization' },
    severity: 'success' as const,
    title: 'Optimization authorized',
  },
};
const confirmationState = {
  ...state,
  screen: {
    ...state.screen,
    input: 'confirmation' as const,
    primaryAction: 'confirm-authorization' as const,
    primaryButton: { enabled: false as const, label: 'Confirm authorization' },
    severity: 'warning' as const,
    title: 'Confirm storage optimization',
  },
};

function setup(authenticatePin = vi.fn()) {
  const harness = {
    begin: vi.fn().mockReturnValue(state),
    checkExpiry: vi.fn().mockReturnValue(state),
    getState: vi.fn().mockReturnValue(state),
    handle: vi.fn().mockResolvedValue({ action: 'view-state-updated', state }),
    release: vi.fn(),
    restart: vi.fn().mockReturnValue(state),
  };
  const harnessFactory = vi.fn().mockReturnValue(harness);
  return {
    authenticatePin,
    harness,
    harnessFactory,
    session: new CanonicalVaultMigrationStartParentSession(
      authenticatePin,
      snapshot,
      harnessFactory,
    ),
  };
}

describe('canonical migration parent snapshot consistency foundation', () => {
  it('begins a fresh harness with the exact snapshot prop', () => {
    const test = setup();
    expect(test.harness.begin).toHaveBeenCalledWith(snapshot);
    expect(test.session.getState()).toBe(state);
  });

  it('matches only the same snapshot and verifier references', () => {
    const test = setup();
    expect(test.session.matches(test.authenticatePin, snapshot)).toBe(true);
    expect(test.session.matches(test.authenticatePin, { ...snapshot })).toBe(false);
    expect(test.session.matches(vi.fn(), snapshot)).toBe(false);
  });

  it('projects expiry through the local harness only', () => {
    const test = setup();
    expect(test.session.checkExpiry(61_000)).toBe(state);
    expect(test.harness.checkExpiry).toHaveBeenCalledWith(61_000);
  });

  it('restarts only a PIN verification that is still pending', () => {
    const test = setup();
    test.harness.getState.mockReturnValueOnce({ ...state, busy: true });
    expect(test.session.cancelPendingPin()).toBe(state);
    expect(test.harnessFactory).toHaveBeenCalledTimes(2);
    expect(test.harness.begin).toHaveBeenLastCalledWith(snapshot);
    expect(test.session.cancelPendingPin()).toBeNull();
    expect(test.harnessFactory).toHaveBeenCalledTimes(2);
  });

  it('can fail closed to a fresh snapshot-bound authorization screen', () => {
    const test = setup();
    expect(test.session.restartAuthorization()).toBe(state);
    expect(test.harness.restart).toHaveBeenCalledWith(snapshot);
  });

  it('invalidates captured callback publication when the session retires', () => {
    const test = setup();
    const canPublish = test.session.capturePublicationGuard();
    expect(canPublish()).toBe(true);
    test.session.dispose();
    expect(canPublish()).toBe(false);
  });

  it('invalidates a pending publication when the session is retired', async () => {
    const test = setup();
    let resolve: ((value: { action: 'view-state-updated'; state: typeof state }) => void) | undefined;
    test.harness.handle.mockReturnValueOnce(new Promise((next) => { resolve = next; }));
    const publishState = vi.fn();
    const pending = test.session.submit({ pin: '123456', type: 'VERIFY_PIN_REQUESTED' }, publishState);
    test.session.dispose();
    resolve?.({ action: 'view-state-updated', state });
    await pending;
    expect(publishState).not.toHaveBeenCalled();
  });

  it('reactivates safely for lifecycle replay without accepting an older request', async () => {
    const test = setup();
    const firstPublish = vi.fn();
    const first = test.session.submit({ type: 'AUTHORIZED_START_REQUESTED' }, firstPublish);
    test.session.dispose();
    test.session.activate();
    const secondPublish = vi.fn();
    await test.session.submit({ type: 'AUTHORIZED_START_REQUESTED' }, secondPublish);
    await first;
    expect(firstPublish).not.toHaveBeenCalled();
    expect(secondPublish).toHaveBeenCalledWith(state);
  });

  it('single-flights rapid PIN retries without superseding the first publication', async () => {
    const test = setup();
    let resolve: ((value: { action: 'view-state-updated'; state: typeof state }) => void) | undefined;
    test.harness.handle.mockReturnValueOnce(new Promise((next) => { resolve = next; }));
    const firstPublish = vi.fn();
    const secondPublish = vi.fn();
    const first = test.session.submit(
      { pin: '123456', type: 'VERIFY_PIN_REQUESTED' },
      firstPublish,
      1_000,
    );
    const second = test.session.submit(
      { pin: '654321', type: 'VERIFY_PIN_REQUESTED' },
      secondPublish,
      1_001,
    );
    await expect(second).resolves.toBeNull();
    expect(test.harness.handle).toHaveBeenCalledOnce();
    resolve?.({ action: 'view-state-updated', state });
    await expect(first).resolves.toEqual({ action: 'view-state-updated', state });
    expect(firstPublish).toHaveBeenCalledWith(state);
    expect(secondPublish).not.toHaveBeenCalled();
  });

  it('allows a fresh PIN retry after the prior attempt settles', async () => {
    const test = setup();
    await test.session.submit({ pin: '123456', type: 'VERIFY_PIN_REQUESTED' }, vi.fn());
    await test.session.submit({ pin: '654321', type: 'VERIFY_PIN_REQUESTED' }, vi.fn());
    expect(test.harness.handle).toHaveBeenCalledTimes(2);
  });

  it('retires a backgrounded PIN flight and allows an independent foreground retry', async () => {
    let resolveOld: ((value: { action: 'view-state-updated'; state: typeof state }) => void) | undefined;
    const oldHarness = {
      begin: vi.fn().mockReturnValue(state),
      checkExpiry: vi.fn().mockReturnValue(state),
      getState: vi.fn().mockReturnValue({ ...state, busy: true }),
      handle: vi.fn().mockReturnValue(new Promise((next) => { resolveOld = next; })),
      release: vi.fn(),
      restart: vi.fn().mockReturnValue(state),
    };
    const newHarness = {
      ...oldHarness,
      begin: vi.fn().mockReturnValue(state),
      getState: vi.fn().mockReturnValue(state),
      handle: vi.fn().mockResolvedValue({ action: 'view-state-updated', state }),
      release: vi.fn(),
    };
    const harnessFactory = vi.fn()
      .mockReturnValueOnce(oldHarness)
      .mockReturnValueOnce(newHarness);
    const session = new CanonicalVaultMigrationStartParentSession(vi.fn(), snapshot, harnessFactory);
    const oldPublish = vi.fn();
    const oldRequest = session.submit(
      { pin: '123456', type: 'VERIFY_PIN_REQUESTED' },
      oldPublish,
    );
    expect(session.cancelPendingPin()).toBe(state);
    session.dispose();
    session.activate();
    const newPublish = vi.fn();
    await session.submit({ pin: '654321', type: 'VERIFY_PIN_REQUESTED' }, newPublish);
    expect(newHarness.handle).toHaveBeenCalledOnce();
    expect(newPublish).toHaveBeenCalledWith(state);
    resolveOld?.({ action: 'view-state-updated', state });
    await oldRequest;
    expect(oldHarness.release).toHaveBeenCalledOnce();
    expect(newHarness.release).not.toHaveBeenCalled();
    expect(oldPublish).not.toHaveBeenCalled();
    expect(newPublish).toHaveBeenCalledOnce();
  });

  it('isolates retired harness cleanup failure from the settled request', async () => {
    let resolveOld: ((value: { action: 'view-state-updated'; state: typeof state }) => void) | undefined;
    const oldHarness = {
      begin: vi.fn().mockReturnValue(state),
      checkExpiry: vi.fn().mockReturnValue(state),
      getState: vi.fn().mockReturnValue({ ...state, busy: true }),
      handle: vi.fn().mockReturnValue(new Promise((next) => { resolveOld = next; })),
      release: vi.fn().mockImplementation(() => { throw new Error('cleanup detail'); }),
      restart: vi.fn().mockReturnValue(state),
    };
    const newHarness = {
      ...oldHarness,
      begin: vi.fn().mockReturnValue(state),
      getState: vi.fn().mockReturnValue(state),
      handle: vi.fn().mockResolvedValue({ action: 'view-state-updated', state }),
      release: vi.fn(),
    };
    const session = new CanonicalVaultMigrationStartParentSession(
      vi.fn(),
      snapshot,
      vi.fn().mockReturnValueOnce(oldHarness).mockReturnValueOnce(newHarness),
    );
    const pending = session.submit({ pin: '123456', type: 'VERIFY_PIN_REQUESTED' }, vi.fn());
    session.cancelPendingPin();
    session.dispose();
    resolveOld?.({ action: 'view-state-updated', state });
    await expect(pending).resolves.toEqual({ action: 'view-state-updated', state });
    expect(oldHarness.release).toHaveBeenCalledOnce();
  });

  it('rechecks fresh scope before forwarding exact confirmation', async () => {
    const test = setup();
    test.harness.checkExpiry.mockReturnValueOnce(confirmationState);
    const recheckConfirmation = vi.fn().mockResolvedValue(undefined);
    const session = new CanonicalVaultMigrationStartParentSession(
      test.authenticatePin,
      snapshot,
      test.harnessFactory,
      recheckConfirmation,
      null,
      () => 1_001,
    );
    await session.submit({
      confirmation: 'OPTIMIZE WALLET STORAGE',
      type: 'CONFIRM_AUTHORIZATION_REQUESTED',
    }, vi.fn());
    expect(recheckConfirmation).toHaveBeenCalledOnce();
    expect(test.harness.handle).toHaveBeenCalledWith(expect.objectContaining({
      type: 'CONFIRM_AUTHORIZATION_REQUESTED',
    }), 1_001);
  });

  it('fails confirmation closed to PIN recovery when fresh scope changes', async () => {
    const test = setup();
    const session = new CanonicalVaultMigrationStartParentSession(
      test.authenticatePin,
      snapshot,
      test.harnessFactory,
      vi.fn().mockRejectedValue(new Error('scope changed')),
    );
    const publishState = vi.fn();
    await expect(session.submit({
      confirmation: 'OPTIMIZE WALLET STORAGE',
      type: 'CONFIRM_AUTHORIZATION_REQUESTED',
    }, publishState)).resolves.toBeNull();
    expect(test.harness.handle).not.toHaveBeenCalled();
    expect(test.harness.restart).toHaveBeenCalledWith(snapshot);
    expect(publishState).toHaveBeenCalledWith(expect.objectContaining({
      error: expect.stringContaining('could not be refreshed'),
    }));
  });

  it('discards a confirmation recheck that finishes after lifecycle retirement', async () => {
    const test = setup();
    let resolveRecheck: (() => void) | undefined;
    let capturedSignal: AbortSignal | undefined;
    const session = new CanonicalVaultMigrationStartParentSession(
      test.authenticatePin,
      snapshot,
      test.harnessFactory,
      vi.fn((signal: AbortSignal) => new Promise<void>((resolve) => {
        capturedSignal = signal;
        resolveRecheck = resolve;
      })),
    );
    const publishState = vi.fn();
    const pending = session.submit({
      confirmation: 'OPTIMIZE WALLET STORAGE',
      type: 'CONFIRM_AUTHORIZATION_REQUESTED',
    }, publishState);
    session.dispose();
    expect(capturedSignal?.aborted).toBe(true);
    resolveRecheck?.();
    await expect(pending).resolves.toBeNull();
    expect(test.harness.handle).not.toHaveBeenCalled();
    expect(publishState).not.toHaveBeenCalled();
  });

  it('single-flights rapid confirmation freshness reads', async () => {
    const test = setup();
    test.harness.checkExpiry.mockReturnValueOnce(confirmationState);
    let resolveRecheck: (() => void) | undefined;
    const recheckConfirmation = vi.fn(() => new Promise<void>((resolve) => {
      resolveRecheck = resolve;
    }));
    const session = new CanonicalVaultMigrationStartParentSession(
      test.authenticatePin,
      snapshot,
      test.harnessFactory,
      recheckConfirmation,
      null,
      () => 1_001,
    );
    const event = {
      confirmation: 'OPTIMIZE WALLET STORAGE',
      type: 'CONFIRM_AUTHORIZATION_REQUESTED' as const,
    };
    const first = session.submit(event, vi.fn());
    await expect(session.submit(event, vi.fn())).resolves.toBeNull();
    expect(recheckConfirmation).toHaveBeenCalledOnce();
    resolveRecheck?.();
    await first;
    expect(test.harness.handle).toHaveBeenCalledOnce();
  });

  it('blocks exact confirmation when authorization expires during the fresh read', async () => {
    const test = setup();
    test.harness.checkExpiry.mockReturnValueOnce(state);
    const session = new CanonicalVaultMigrationStartParentSession(
      test.authenticatePin,
      snapshot,
      test.harnessFactory,
      vi.fn().mockResolvedValue(undefined),
      null,
      () => 61_000,
    );
    const publishState = vi.fn();
    await expect(session.submit({
      confirmation: 'OPTIMIZE WALLET STORAGE',
      type: 'CONFIRM_AUTHORIZATION_REQUESTED',
    }, publishState, 1_000)).resolves.toBeNull();
    expect(test.harness.checkExpiry).toHaveBeenCalledWith(61_000);
    expect(publishState).toHaveBeenCalledWith(state);
    expect(test.harness.handle).not.toHaveBeenCalled();
  });

  it('rechecks fresh scope before reporting authorized start', async () => {
    const test = setup();
    test.harness.checkExpiry.mockReturnValueOnce(authorizedState);
    const recheckAuthorizedStart = vi.fn().mockResolvedValue(undefined);
    const session = new CanonicalVaultMigrationStartParentSession(
      test.authenticatePin,
      snapshot,
      test.harnessFactory,
      null,
      recheckAuthorizedStart,
      () => 1_001,
    );
    await session.submit({ type: 'AUTHORIZED_START_REQUESTED' }, vi.fn());
    expect(recheckAuthorizedStart).toHaveBeenCalledOnce();
    expect(test.harness.handle).toHaveBeenCalledWith(
      { type: 'AUTHORIZED_START_REQUESTED' },
      expect.any(Number),
    );
  });

  it('blocks authorized-start reporting when fresh scope changes', async () => {
    const test = setup();
    const session = new CanonicalVaultMigrationStartParentSession(
      test.authenticatePin,
      snapshot,
      test.harnessFactory,
      null,
      vi.fn().mockRejectedValue(new Error('scope changed')),
    );
    const publishState = vi.fn();
    await expect(session.submit(
      { type: 'AUTHORIZED_START_REQUESTED' },
      publishState,
    )).resolves.toBeNull();
    expect(test.harness.handle).not.toHaveBeenCalled();
    expect(test.harness.restart).toHaveBeenCalledWith(snapshot);
    expect(publishState).toHaveBeenCalledWith(expect.objectContaining({
      error: expect.stringContaining('could not be refreshed'),
    }));
    expect(test.harness).not.toHaveProperty('executeIntent');
  });

  it('single-flights rapid authorized-start freshness reads', async () => {
    const test = setup();
    test.harness.checkExpiry.mockReturnValueOnce(authorizedState);
    let resolveRecheck: (() => void) | undefined;
    const recheckAuthorizedStart = vi.fn(() => new Promise<void>((resolve) => {
      resolveRecheck = resolve;
    }));
    const session = new CanonicalVaultMigrationStartParentSession(
      test.authenticatePin,
      snapshot,
      test.harnessFactory,
      null,
      recheckAuthorizedStart,
      () => 1_001,
    );
    const event = { type: 'AUTHORIZED_START_REQUESTED' as const };
    const first = session.submit(event, vi.fn());
    await expect(session.submit(event, vi.fn())).resolves.toBeNull();
    expect(recheckAuthorizedStart).toHaveBeenCalledOnce();
    resolveRecheck?.();
    await first;
    expect(test.harness.handle).toHaveBeenCalledOnce();
  });

  it('blocks report-only start when authorization expires during the fresh read', async () => {
    const test = setup();
    test.harness.checkExpiry.mockReturnValueOnce(state);
    const session = new CanonicalVaultMigrationStartParentSession(
      test.authenticatePin,
      snapshot,
      test.harnessFactory,
      null,
      vi.fn().mockResolvedValue(undefined),
      () => 61_000,
    );
    const publishState = vi.fn();
    await expect(session.submit(
      { type: 'AUTHORIZED_START_REQUESTED' },
      publishState,
      1_000,
    )).resolves.toBeNull();
    expect(test.harness.checkExpiry).toHaveBeenCalledWith(61_000);
    expect(publishState).toHaveBeenCalledWith(state);
    expect(test.harness.handle).not.toHaveBeenCalled();
  });
});
