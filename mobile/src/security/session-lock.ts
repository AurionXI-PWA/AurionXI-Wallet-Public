import { AUTO_LOCK_MS } from './pin-policy';

/**
 * A short return window prevents an in-progress Testnet review from being
 * discarded when the user briefly switches to a messenger or BscScan. It is
 * deliberately no longer than the PIN-confirmed signing session.
 */
export const BACKGROUND_RETURN_GRACE_MS = 90_000;

export type SessionLockState = {
  status: 'locked' | 'unlocked';
  lastActiveAt?: number;
  backgroundedAt?: number;
  reason?: 'startup' | 'background' | 'background-timeout' | 'inactivity' | 'manual';
};

export type SessionLockEvent =
  | { type: 'UNLOCK'; now: number }
  | { type: 'ACTIVITY'; now: number }
  | { type: 'BACKGROUND'; now: number }
  | { type: 'FOREGROUND'; now: number }
  | { type: 'CHECK_TIMEOUT'; now: number }
  | { type: 'LOCK' };

export const INITIAL_SESSION_STATE: SessionLockState = {
  status: 'locked',
  reason: 'startup',
};

export function transitionSessionLock(
  state: SessionLockState,
  event: SessionLockEvent,
): SessionLockState {
  if (event.type === 'UNLOCK') {
    return { status: 'unlocked', lastActiveAt: event.now };
  }
  if (event.type === 'BACKGROUND') {
    if (state.status === 'locked') return state;
    return { ...state, backgroundedAt: event.now };
  }
  if (event.type === 'FOREGROUND') {
    if (state.status === 'locked' || state.backgroundedAt === undefined) return state;
    if (event.now - state.backgroundedAt > BACKGROUND_RETURN_GRACE_MS) {
      return { status: 'locked', reason: 'background-timeout' };
    }
    return { status: 'unlocked', lastActiveAt: event.now };
  }
  if (event.type === 'LOCK') return { status: 'locked', reason: 'manual' };
  if (state.status === 'locked') return state;
  // The explicit 90-second return grace takes precedence while the app is in
  // the background; an old idle timestamp must not bypass that guarantee.
  if (state.backgroundedAt !== undefined) return state;
  if (event.type === 'ACTIVITY') return { ...state, lastActiveAt: event.now };
  if (
    event.type === 'CHECK_TIMEOUT' &&
    state.lastActiveAt !== undefined &&
    event.now - state.lastActiveAt >= AUTO_LOCK_MS
  ) {
    return { status: 'locked', reason: 'inactivity' };
  }
  return state;
}
