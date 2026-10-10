import { describe, expect, it } from 'vitest';

import { AUTO_LOCK_MS } from './pin-policy';
import {
  BACKGROUND_RETURN_GRACE_MS,
  INITIAL_SESSION_STATE,
  transitionSessionLock,
} from './session-lock';

describe('wallet session lock', () => {
  it('preserves an unlocked session during the short background return window', () => {
    const unlocked = transitionSessionLock(INITIAL_SESSION_STATE, {
      type: 'UNLOCK',
      now: 1_000,
    });
    expect(unlocked.status).toBe('unlocked');
    const backgrounded = transitionSessionLock(unlocked, { type: 'BACKGROUND', now: 2_000 });
    expect(backgrounded).toMatchObject({ status: 'unlocked', backgroundedAt: 2_000 });
    expect(transitionSessionLock(backgrounded, { type: 'FOREGROUND', now: 2_000 + BACKGROUND_RETURN_GRACE_MS })).toEqual({
      status: 'unlocked',
      lastActiveAt: 2_000 + BACKGROUND_RETURN_GRACE_MS,
    });
  });

  it('locks after the background return window expires', () => {
    const unlocked = transitionSessionLock(INITIAL_SESSION_STATE, {
      type: 'UNLOCK',
      now: 1_000,
    });
    const backgrounded = transitionSessionLock(unlocked, { type: 'BACKGROUND', now: 2_000 });
    expect(transitionSessionLock(backgrounded, {
      type: 'FOREGROUND',
      now: 2_001 + BACKGROUND_RETURN_GRACE_MS,
    })).toEqual({ status: 'locked', reason: 'background-timeout' });
  });

  it('does not let a stale inactivity deadline bypass the return window', () => {
    const unlocked = transitionSessionLock(INITIAL_SESSION_STATE, {
      type: 'UNLOCK',
      now: 1_000,
    });
    const backgrounded = transitionSessionLock(unlocked, {
      type: 'BACKGROUND',
      now: 1_000 + AUTO_LOCK_MS + 1,
    });
    expect(transitionSessionLock(backgrounded, {
      type: 'CHECK_TIMEOUT',
      now: 1_000 + AUTO_LOCK_MS + 2,
    }).status).toBe('unlocked');
  });

  it('locks after the inactivity deadline', () => {
    const unlocked = transitionSessionLock(INITIAL_SESSION_STATE, {
      type: 'UNLOCK',
      now: 1_000,
    });
    expect(
      transitionSessionLock(unlocked, {
        type: 'CHECK_TIMEOUT',
        now: 1_000 + AUTO_LOCK_MS - 1,
      }).status,
    ).toBe('unlocked');
    expect(
      transitionSessionLock(unlocked, {
        type: 'CHECK_TIMEOUT',
        now: 1_000 + AUTO_LOCK_MS,
      }),
    ).toEqual({ status: 'locked', reason: 'inactivity' });
  });

  it('refreshes the inactivity deadline after user activity', () => {
    const unlocked = transitionSessionLock(INITIAL_SESSION_STATE, {
      type: 'UNLOCK',
      now: 1_000,
    });
    const active = transitionSessionLock(unlocked, {
      type: 'ACTIVITY',
      now: 1_000 + AUTO_LOCK_MS - 1,
    });

    expect(
      transitionSessionLock(active, {
        type: 'CHECK_TIMEOUT',
        now: 1_000 + AUTO_LOCK_MS,
      }).status,
    ).toBe('unlocked');
  });

  it('supports an explicit manual lock', () => {
    const unlocked = transitionSessionLock(INITIAL_SESSION_STATE, {
      type: 'UNLOCK',
      now: 1_000,
    });

    expect(transitionSessionLock(unlocked, { type: 'LOCK' })).toEqual({
      status: 'locked',
      reason: 'manual',
    });
  });
});
