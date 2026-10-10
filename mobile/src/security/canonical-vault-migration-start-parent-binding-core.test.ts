import { describe, expect, it, vi } from 'vitest';

import {
  bindCanonicalVaultMigrationStartParentEvent,
  CanonicalVaultMigrationStartParentPublicationGate,
} from './canonical-vault-migration-start-parent-binding-core';

const state = {
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

describe('canonical migration unmounted component parent binding foundation', () => {
  it('publishes the harness result after a typed local event', async () => {
    const result = { action: 'view-state-updated' as const, state };
    const harness = { getState: vi.fn(), handle: vi.fn().mockResolvedValue(result) };
    const publishState = vi.fn();
    await expect(bindCanonicalVaultMigrationStartParentEvent(
      harness,
      { pin: '123456', type: 'VERIFY_PIN_REQUESTED' },
      publishState,
      1_000,
    )).resolves.toBe(result);
    expect(harness.handle).toHaveBeenCalledWith({ pin: '123456', type: 'VERIFY_PIN_REQUESTED' }, 1_000);
    expect(publishState).toHaveBeenCalledWith(state);
  });

  it('publishes only the harness generic state when verification rejects', async () => {
    const failureState = { ...state, error: 'PIN verification did not complete.' };
    const harness = {
      getState: vi.fn().mockReturnValue(failureState),
      handle: vi.fn().mockRejectedValue(new Error('raw verifier detail')),
    };
    const publishState = vi.fn();
    await expect(bindCanonicalVaultMigrationStartParentEvent(
      harness,
      { pin: '000000', type: 'VERIFY_PIN_REQUESTED' },
      publishState,
    )).resolves.toBeNull();
    expect(publishState).toHaveBeenCalledWith(failureState);
    expect(JSON.stringify(publishState.mock.calls)).not.toContain('000000');
    expect(JSON.stringify(publishState.mock.calls)).not.toContain('raw verifier detail');
  });

  it('keeps authorized start report-only at the parent boundary', async () => {
    const result = { action: 'authorized-start-reported' as const, state };
    const harness = { getState: vi.fn(), handle: vi.fn().mockResolvedValue(result) };
    await expect(bindCanonicalVaultMigrationStartParentEvent(
      harness,
      { type: 'AUTHORIZED_START_REQUESTED' },
      vi.fn(),
    )).resolves.toEqual(result);
    expect(harness).not.toHaveProperty('navigate');
    expect(harness).not.toHaveProperty('executeIntent');
  });

  it('does not publish a pending result after parent disposal', async () => {
    let resolve: ((value: { action: 'view-state-updated'; state: typeof state }) => void) | undefined;
    const harness = {
      getState: vi.fn(),
      handle: vi.fn().mockReturnValue(new Promise((next) => { resolve = next; })),
    };
    const gate = new CanonicalVaultMigrationStartParentPublicationGate();
    const publishState = vi.fn();
    gate.activate();
    const pending = bindCanonicalVaultMigrationStartParentEvent(
      harness,
      { pin: '123456', type: 'VERIFY_PIN_REQUESTED' },
      publishState,
      1_000,
      gate.beginRequest(),
    );
    gate.dispose();
    resolve?.({ action: 'view-state-updated', state });
    await pending;
    expect(publishState).not.toHaveBeenCalled();
  });

  it('allows only the newest request generation to publish', async () => {
    const gate = new CanonicalVaultMigrationStartParentPublicationGate();
    gate.activate();
    const first = gate.beginRequest();
    const second = gate.beginRequest();
    expect(first()).toBe(false);
    expect(second()).toBe(true);
  });

  it('does not read or publish generic failure state after disposal', async () => {
    const gate = new CanonicalVaultMigrationStartParentPublicationGate();
    const harness = {
      getState: vi.fn(),
      handle: vi.fn().mockRejectedValue(new Error('raw verifier detail')),
    };
    const publishState = vi.fn();
    gate.activate();
    const canPublish = gate.beginRequest();
    gate.dispose();
    await bindCanonicalVaultMigrationStartParentEvent(
      harness,
      { pin: '000000', type: 'VERIFY_PIN_REQUESTED' },
      publishState,
      1_000,
      canPublish,
    );
    expect(harness.getState).not.toHaveBeenCalled();
    expect(publishState).not.toHaveBeenCalled();
  });

  it('keeps a lifecycle publication valid across requests but not disposal', () => {
    const gate = new CanonicalVaultMigrationStartParentPublicationGate();
    gate.activate();
    const canPublish = gate.captureLifecyclePublication();
    gate.beginRequest();
    gate.beginRequest();
    expect(canPublish()).toBe(true);
    gate.dispose();
    expect(canPublish()).toBe(false);
  });
});
