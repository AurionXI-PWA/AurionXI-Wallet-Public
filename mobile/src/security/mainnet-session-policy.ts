import { BACKGROUND_RETURN_GRACE_MS, transitionSessionLock, type SessionLockEvent, type SessionLockState } from './session-lock';

/** Owner-requested 90-second UI return grace; transaction authorization is separate. */
export function transitionMainnetSessionLock(state: SessionLockState, event: SessionLockEvent): SessionLockState {
  // Duplicate background events must not extend the original return deadline.
  if (event.type === 'BACKGROUND' && state.backgroundedAt !== undefined) return state;
  if (event.type === 'CHECK_TIMEOUT' && state.status === 'unlocked' && state.backgroundedAt !== undefined &&
    event.now - state.backgroundedAt > BACKGROUND_RETURN_GRACE_MS) {
    return { status: 'locked', reason: 'background-timeout' };
  }
  return transitionSessionLock(state, event);
}
