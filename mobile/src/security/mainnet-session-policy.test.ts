import { describe, expect, it } from 'vitest';
import { transitionMainnetSessionLock } from './mainnet-session-policy';
import { AUTO_LOCK_MS } from './pin-policy';
import { BACKGROUND_RETURN_GRACE_MS, INITIAL_SESSION_STATE } from './session-lock';

describe('Mainnet session policy', () => {
  const unlocked = { status: 'unlocked' as const, lastActiveAt: 100 };
  it.each([10_000, BACKGROUND_RETURN_GRACE_MS])('preserves the unlocked UI when returning within %s ms', (elapsed) => {
    const backgrounded = transitionMainnetSessionLock(unlocked, { type: 'BACKGROUND', now: 101 });
    expect(backgrounded).toMatchObject({ status: 'unlocked', backgroundedAt: 101 });
    expect(transitionMainnetSessionLock(backgrounded, { type: 'FOREGROUND', now: 101 + elapsed })).toEqual({ status: 'unlocked', lastActiveAt: 101 + elapsed });
  });
  it('locks after the return deadline, even if JS background timers were suspended', () => {
    const backgrounded = transitionMainnetSessionLock(unlocked, { type: 'BACKGROUND', now: 101 });
    expect(transitionMainnetSessionLock(backgrounded, { type: 'FOREGROUND', now: 102 + BACKGROUND_RETURN_GRACE_MS })).toEqual({ status: 'locked', reason: 'background-timeout' });
  });
  it('locks on a background timeout check without extending the grace on duplicate events', () => {
    const backgrounded = transitionMainnetSessionLock(unlocked, { type: 'BACKGROUND', now: 101 });
    const repeated = transitionMainnetSessionLock(backgrounded, { type: 'BACKGROUND', now: 1000 });
    expect(repeated.backgroundedAt).toBe(101);
    expect(transitionMainnetSessionLock(repeated, { type: 'CHECK_TIMEOUT', now: 101 + BACKGROUND_RETURN_GRACE_MS }).status).toBe('unlocked');
    expect(transitionMainnetSessionLock(repeated, { type: 'CHECK_TIMEOUT', now: 102 + BACKGROUND_RETURN_GRACE_MS }).status).toBe('locked');
  });
  it('never unlocks a cold-start or manually locked wallet through return grace', () => {
    expect(transitionMainnetSessionLock(INITIAL_SESSION_STATE, { type: 'FOREGROUND', now: 101 }).status).toBe('locked');
    const locked = transitionMainnetSessionLock(unlocked, { type: 'LOCK' });
    expect(transitionMainnetSessionLock(transitionMainnetSessionLock(locked, { type: 'BACKGROUND', now: 101 }), { type: 'FOREGROUND', now: 102 }).status).toBe('locked');
  });
  it('locks at the idle deadline and requires an explicit unlock', () => {
    const locked = transitionMainnetSessionLock(unlocked, { type: 'CHECK_TIMEOUT', now: 100 + AUTO_LOCK_MS });
    expect(locked.status).toBe('locked');
    expect(transitionMainnetSessionLock(locked, { type: 'ACTIVITY', now: 101 + AUTO_LOCK_MS }).status).toBe('locked');
    expect(transitionMainnetSessionLock(locked, { type: 'UNLOCK', now: 102 + AUTO_LOCK_MS }).status).toBe('unlocked');
  });
});
