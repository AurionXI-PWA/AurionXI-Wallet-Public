import { describe, expect, it, vi } from 'vitest';

import { CanonicalVaultMigrationStartExpiryScheduler } from './canonical-vault-migration-start-expiry-scheduler-core';

function setup() {
  let callback: (() => void) | undefined;
  const clearTimer = vi.fn();
  const setTimer = vi.fn().mockImplementation((next: () => void) => {
    callback = next;
    return 7 as unknown as ReturnType<typeof setTimeout>;
  });
  return {
    clearTimer,
    fire: () => callback?.(),
    scheduler: new CanonicalVaultMigrationStartExpiryScheduler({ clearTimer, setTimer }),
    setTimer,
  };
}

describe('canonical migration unmounted session expiry scheduler foundation', () => {
  it('schedules the exact remaining authorization window', () => {
    const test = setup();
    test.scheduler.schedule(61_000, 1_000, vi.fn());
    expect(test.setTimer).toHaveBeenCalledWith(expect.any(Function), 60_000);
  });

  it('reports the bound expiry instant when the timer fires', () => {
    const test = setup();
    const expire = vi.fn();
    test.scheduler.schedule(61_000, 1_000, expire);
    test.fire();
    expect(expire).toHaveBeenCalledWith(61_000);
  });

  it('cancels the prior timer when a newer schedule replaces it', () => {
    const test = setup();
    test.scheduler.schedule(61_000, 1_000, vi.fn());
    test.scheduler.schedule(62_000, 2_000, vi.fn());
    expect(test.clearTimer).toHaveBeenCalledWith(7);
  });

  it('invalidates a pending timer without disposing the scheduler', () => {
    const test = setup();
    const expire = vi.fn();
    test.scheduler.schedule(61_000, 1_000, expire);
    test.scheduler.cancel();
    test.fire();
    test.scheduler.schedule(62_000, 2_000, expire);
    expect(test.clearTimer).toHaveBeenCalledWith(7);
    expect(expire).not.toHaveBeenCalled();
    expect(test.setTimer).toHaveBeenCalledTimes(2);
  });

  it('cancels on disposal and rejects late scheduling', () => {
    const test = setup();
    const expire = vi.fn();
    test.scheduler.schedule(61_000, 1_000, expire);
    test.scheduler.dispose();
    test.fire();
    test.scheduler.schedule(62_000, 2_000, expire);
    expect(test.clearTimer).toHaveBeenCalledWith(7);
    expect(test.setTimer).toHaveBeenCalledTimes(1);
    expect(expire).not.toHaveBeenCalled();
  });

  it('can reactivate after development lifecycle replay', () => {
    const test = setup();
    test.scheduler.dispose();
    test.scheduler.activate();
    test.scheduler.schedule(61_000, 1_000, vi.fn());
    expect(test.setTimer).toHaveBeenCalledOnce();
  });
});
