import { describe, expect, it, vi } from 'vitest';

import { CanonicalVaultMigrationStartAppStateCoordinator } from './canonical-vault-migration-start-app-state-coordinator-core';

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

function setup(reportCallbackFailure: () => void = vi.fn()) {
  const scheduledCallbacks: ((expiryInstant: number) => void)[] = [];
  const scheduler = {
    activate: vi.fn(),
    cancel: vi.fn(),
    dispose: vi.fn(),
    schedule: vi.fn().mockImplementation((
      _expiresAt: number,
      _now: number,
      callback: (expiryInstant: number) => void,
    ) => { scheduledCallbacks.push(callback); }),
  };
  const session = {
    activate: vi.fn(),
    cancelPendingPin: vi.fn().mockReturnValue(null),
    capturePublicationGuard: vi.fn().mockReturnValue(() => true),
    checkExpiry: vi.fn().mockReturnValue(state),
    dispose: vi.fn(),
    restartAuthorization: vi.fn().mockReturnValue(state),
  };
  return {
    coordinator: new CanonicalVaultMigrationStartAppStateCoordinator(
      session,
      scheduler,
      reportCallbackFailure,
    ),
    fireScheduled: (expiryInstant: number) => scheduledCallbacks.at(-1)?.(expiryInstant),
    fireScheduledAt: (index: number, expiryInstant: number) => scheduledCallbacks[index]?.(expiryInstant),
    scheduler,
    session,
    reportCallbackFailure,
  };
}

describe('canonical migration app background expiry safety foundation', () => {
  it('binds a successful PIN authorization to exactly sixty seconds', () => {
    const test = setup();
    test.coordinator.recordPinAuthorization(1_000, vi.fn());
    expect(test.scheduler.schedule).toHaveBeenCalledWith(61_000, 1_000, expect.any(Function));
  });

  it('suspends timer publication and the parent session in background', () => {
    const test = setup();
    test.coordinator.background();
    expect(test.scheduler.dispose).toHaveBeenCalledOnce();
    expect(test.session.cancelPendingPin).toHaveBeenCalledOnce();
    expect(test.session.dispose).toHaveBeenCalledOnce();
  });

  it('deduplicates inactive and background notifications', () => {
    const test = setup();
    test.coordinator.background();
    test.coordinator.background();
    expect(test.scheduler.dispose).toHaveBeenCalledOnce();
    expect(test.session.cancelPendingPin).toHaveBeenCalledOnce();
    expect(test.session.dispose).toHaveBeenCalledOnce();
  });

  it('rejects a PIN authorization result that arrives while backgrounded', () => {
    const test = setup();
    test.coordinator.background();
    test.coordinator.recordPinAuthorization(1_000, vi.fn());
    expect(test.scheduler.schedule).not.toHaveBeenCalled();
  });

  it('checks expiry before rescheduling the remaining foreground window', () => {
    const test = setup();
    const publishState = vi.fn();
    test.coordinator.recordPinAuthorization(1_000, publishState);
    test.scheduler.schedule.mockClear();
    test.coordinator.background();
    test.coordinator.foreground(31_000, publishState);
    expect(test.scheduler.activate).toHaveBeenCalledOnce();
    expect(test.session.activate).toHaveBeenCalledOnce();
    expect(test.session.checkExpiry).toHaveBeenCalledWith(31_000);
    expect(publishState).toHaveBeenCalledWith(state);
    expect(test.scheduler.schedule).toHaveBeenCalledWith(61_000, 31_000, expect.any(Function));
  });

  it('deduplicates repeated active notifications', () => {
    const test = setup();
    const publishState = vi.fn();
    test.coordinator.background();
    test.coordinator.foreground(31_000, publishState);
    test.coordinator.foreground(32_000, publishState);
    expect(test.scheduler.activate).toHaveBeenCalledOnce();
    expect(test.session.activate).toHaveBeenCalledOnce();
    expect(test.session.checkExpiry).toHaveBeenCalledOnce();
    expect(publishState).toHaveBeenCalledOnce();
  });

  it('fails closed once when an active notification moves the clock backward', () => {
    const test = setup();
    const publishState = vi.fn();
    test.coordinator.foreground(10_000, publishState);
    test.coordinator.foreground(9_999, publishState);
    test.coordinator.foreground(9_998, publishState);
    expect(test.session.restartAuthorization).toHaveBeenCalledOnce();
    expect(test.scheduler.activate).toHaveBeenCalledOnce();
    expect(publishState).toHaveBeenCalledWith(state);
  });

  it('rejects PIN authorization while the clock remains behind', () => {
    const test = setup();
    const publishState = vi.fn();
    test.coordinator.foreground(10_000, publishState);
    test.coordinator.foreground(9_999, publishState);
    test.scheduler.schedule.mockClear();
    test.coordinator.recordPinAuthorization(9_999, publishState);
    expect(test.scheduler.schedule).not.toHaveBeenCalled();
  });

  it('allows a fresh authorization only after the clock catches up', () => {
    const test = setup();
    const publishState = vi.fn();
    test.coordinator.foreground(10_000, publishState);
    test.coordinator.foreground(9_999, publishState);
    test.coordinator.recordPinAuthorization(10_000, publishState);
    expect(test.scheduler.schedule).toHaveBeenCalledWith(70_000, 10_000, expect.any(Function));
  });

  it('resets expired foreground state without scheduling another timer', () => {
    const test = setup();
    const publishState = vi.fn();
    test.coordinator.recordPinAuthorization(1_000, publishState);
    test.scheduler.schedule.mockClear();
    test.coordinator.background();
    test.coordinator.foreground(61_000, publishState);
    expect(test.session.checkExpiry).toHaveBeenCalledWith(61_000);
    expect(test.scheduler.cancel).toHaveBeenCalledOnce();
    expect(test.scheduler.schedule).not.toHaveBeenCalled();
  });

  it('expires immediately when an active event jumps to the deadline', () => {
    const test = setup();
    const publishState = vi.fn();
    test.coordinator.recordPinAuthorization(1_000, publishState);
    test.coordinator.foreground(61_000, publishState);
    expect(test.scheduler.cancel).toHaveBeenCalledOnce();
    expect(test.session.checkExpiry).toHaveBeenCalledWith(61_000);
    expect(publishState).toHaveBeenCalledWith(state);
  });

  it('deduplicates later active events after a forward-jump expiry', () => {
    const test = setup();
    const publishState = vi.fn();
    test.coordinator.recordPinAuthorization(1_000, publishState);
    test.coordinator.foreground(70_000, publishState);
    test.coordinator.foreground(80_000, publishState);
    expect(test.scheduler.cancel).toHaveBeenCalledOnce();
    expect(test.session.checkExpiry).toHaveBeenCalledOnce();
    expect(publishState).toHaveBeenCalledOnce();
  });

  it('publishes expiry once when the timer wins the foreground race', () => {
    const test = setup();
    const publishState = vi.fn();
    test.coordinator.recordPinAuthorization(1_000, publishState);
    test.fireScheduled(61_000);
    test.coordinator.foreground(61_000, publishState);
    expect(test.session.checkExpiry).toHaveBeenCalledOnce();
    expect(publishState).toHaveBeenCalledOnce();
    expect(test.scheduler.cancel).not.toHaveBeenCalled();
  });

  it('publishes expiry once when the foreground check wins the timer race', () => {
    const test = setup();
    const publishState = vi.fn();
    test.coordinator.recordPinAuthorization(1_000, publishState);
    test.coordinator.foreground(61_000, publishState);
    test.fireScheduled(61_000);
    expect(test.session.checkExpiry).toHaveBeenCalledOnce();
    expect(publishState).toHaveBeenCalledOnce();
    expect(test.scheduler.cancel).toHaveBeenCalledOnce();
  });

  it('rejects an old callback when a new authorization has the same deadline', () => {
    const test = setup();
    const publishState = vi.fn();
    test.coordinator.recordPinAuthorization(1_000, publishState);
    test.coordinator.recordPinAuthorization(1_000, publishState);
    test.fireScheduledAt(0, 61_000);
    expect(test.session.checkExpiry).not.toHaveBeenCalled();
    expect(publishState).not.toHaveBeenCalled();
    test.fireScheduledAt(1, 61_000);
    expect(test.session.checkExpiry).toHaveBeenCalledOnce();
    expect(publishState).toHaveBeenCalledOnce();
  });

  it('rejects expiry publication after the captured lifecycle guard retires', () => {
    const test = setup();
    let active = true;
    test.session.capturePublicationGuard.mockReturnValue(() => active);
    const publishState = vi.fn();
    test.coordinator.recordPinAuthorization(1_000, publishState);
    active = false;
    test.fireScheduled(61_000);
    expect(test.session.checkExpiry).not.toHaveBeenCalled();
    expect(publishState).not.toHaveBeenCalled();
  });

  it('isolates a local expiry-check exception and remains reusable', () => {
    const test = setup();
    const publishState = vi.fn();
    test.session.checkExpiry.mockImplementationOnce(() => { throw new Error('local detail'); });
    test.coordinator.recordPinAuthorization(1_000, publishState);
    expect(() => test.fireScheduled(61_000)).not.toThrow();
    expect(test.reportCallbackFailure).toHaveBeenCalledOnce();
    test.coordinator.recordPinAuthorization(2_000, publishState);
    expect(test.scheduler.schedule).toHaveBeenLastCalledWith(62_000, 2_000, expect.any(Function));
  });

  it('isolates a state-publication exception and consumes expiry once', () => {
    const test = setup();
    const publishState = vi.fn().mockImplementationOnce(() => { throw new Error('render detail'); });
    test.coordinator.recordPinAuthorization(1_000, publishState);
    expect(() => test.fireScheduled(61_000)).not.toThrow();
    expect(test.reportCallbackFailure).toHaveBeenCalledOnce();
    test.fireScheduled(61_000);
    expect(test.session.checkExpiry).toHaveBeenCalledOnce();
  });

  it('fails closed when the lifecycle guard itself throws', () => {
    const test = setup();
    test.session.capturePublicationGuard.mockReturnValue(() => { throw new Error('guard detail'); });
    const publishState = vi.fn();
    test.coordinator.recordPinAuthorization(1_000, publishState);
    expect(() => test.fireScheduled(61_000)).not.toThrow();
    expect(test.reportCallbackFailure).toHaveBeenCalledOnce();
    expect(test.session.checkExpiry).not.toHaveBeenCalled();
    expect(publishState).not.toHaveBeenCalled();
  });

  it('isolates an exception thrown by the failure reporter', () => {
    const test = setup(() => { throw new Error('reporter detail'); });
    test.session.checkExpiry.mockImplementationOnce(() => { throw new Error('local detail'); });
    test.coordinator.recordPinAuthorization(1_000, vi.fn());
    expect(() => test.fireScheduled(61_000)).not.toThrow();
  });

  it('forgets authorization scope and suspends everything on final disposal', () => {
    const test = setup();
    test.coordinator.recordPinAuthorization(1_000, vi.fn());
    test.coordinator.dispose();
    test.scheduler.schedule.mockClear();
    test.coordinator.foreground(31_000, vi.fn());
    expect(test.scheduler.schedule).not.toHaveBeenCalled();
  });
});
