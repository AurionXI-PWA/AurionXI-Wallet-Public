import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from 'react';
import { AppState, View } from 'react-native';

import {
  INITIAL_SESSION_STATE,
  transitionSessionLock,
} from './session-lock';
import { cancelActiveBiometricAuthentication } from './biometric-authentication';
import { destroyActiveRecoverySecretSession } from './recovery-secret-session-manager';

type SessionLockContextValue = {
  isLocked: boolean;
  lock: () => void;
  recordActivity: () => void;
  unlock: () => void;
};

const SessionLockContext = createContext<SessionLockContextValue | null>(null);

export function SessionLockProvider({ children }: PropsWithChildren) {
  const [state, dispatch] = useReducer(transitionSessionLock, INITIAL_SESSION_STATE);
  const appStateRef = useRef(AppState.currentState);

  useEffect(() => {
    const appStateSubscription = AppState.addEventListener('change', (nextState) => {
      const previousState = appStateRef.current;
      appStateRef.current = nextState;
      // Android can emit both inactive and background for one app switch.
      // Record exactly one boundary so the 90-second return grace is not
      // shortened or replaced by duplicate lifecycle events.
      if (previousState === 'active' && nextState !== 'active') {
        destroyActiveRecoverySecretSession();
        dispatch({ type: 'BACKGROUND', now: Date.now() });
        void cancelActiveBiometricAuthentication();
        return;
      }
      if (previousState !== 'active' && nextState === 'active') {
        dispatch({ type: 'FOREGROUND', now: Date.now() });
      }
    });
    const timeoutCheck = setInterval(() => {
      dispatch({ type: 'CHECK_TIMEOUT', now: Date.now() });
    }, 15_000);

    return () => {
      destroyActiveRecoverySecretSession();
      appStateSubscription.remove();
      clearInterval(timeoutCheck);
    };
  }, []);

  useEffect(() => {
    if (state.status === 'locked') destroyActiveRecoverySecretSession();
  }, [state.status]);

  const lock = useCallback(() => {
    destroyActiveRecoverySecretSession();
    dispatch({ type: 'LOCK' });
  }, []);
  const unlock = useCallback(() => dispatch({ type: 'UNLOCK', now: Date.now() }), []);
  const recordActivity = useCallback(
    () => dispatch({ type: 'ACTIVITY', now: Date.now() }),
    [],
  );
  const value = useMemo(
    () => ({ isLocked: state.status === 'locked', lock, recordActivity, unlock }),
    [lock, recordActivity, state.status, unlock],
  );

  return (
    <SessionLockContext.Provider value={value}>
      <View onTouchStart={recordActivity} style={{ flex: 1 }}>
        {children}
      </View>
    </SessionLockContext.Provider>
  );
}

export function useSessionLock() {
  const value = useContext(SessionLockContext);
  if (!value) throw new Error('useSessionLock must be used within SessionLockProvider.');
  return value;
}
