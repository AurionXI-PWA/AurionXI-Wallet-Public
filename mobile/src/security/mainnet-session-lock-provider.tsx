import { createContext, type PropsWithChildren, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { AppState, View } from 'react-native';

import { cancelActiveBiometricAuthentication } from './biometric-authentication';
import { destroyActiveMainnetRecoverySecretSession } from './mainnet-recovery-secret-session-manager';
import { invalidateNativeMainnetAuthorizations } from './mainnet-native-authorization-boundary';
import { INITIAL_SESSION_STATE, type SessionLockEvent } from './session-lock';
import { transitionMainnetSessionLock } from './mainnet-session-policy';

type MainnetSessionValue = { isLocked: boolean; authorizationEpoch: number; isAuthorizationActive: (epoch: number) => boolean; lock: () => void; recordActivity: () => void; unlock: () => void };
const MainnetSessionContext = createContext<MainnetSessionValue | null>(null);

/** Independent Mainnet session; it never changes the Testnet session state. */
export function MainnetSessionLockProvider({ children }: PropsWithChildren) {
  const [state, dispatch] = useReducer(transitionMainnetSessionLock, INITIAL_SESSION_STATE);
  const stateRef = useRef(INITIAL_SESSION_STATE);
  const appStateRef = useRef(AppState.currentState);
  const lockedRef = useRef(true);
  const authorizationEpochRef = useRef(0);
  const [authorizationEpoch, setAuthorizationEpoch] = useState(0);
  const invalidateAuthorization = useCallback(() => {
    authorizationEpochRef.current += 1;
    setAuthorizationEpoch(authorizationEpochRef.current);
    void invalidateNativeMainnetAuthorizations();
  }, []);
  const dispatchSession = useCallback((event: SessionLockEvent) => {
    const previous = stateRef.current;
    const next = transitionMainnetSessionLock(previous, event);
    stateRef.current = next;
    lockedRef.current = next.status === 'locked';
    if (previous.status === 'unlocked' && next.status === 'locked') {
      invalidateAuthorization();
      destroyActiveMainnetRecoverySecretSession();
      void cancelActiveBiometricAuthentication();
    }
    dispatch(event);
  }, [invalidateAuthorization]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      const previous = appStateRef.current;
      appStateRef.current = next;
      // Android may report `inactive` while its own BiometricPrompt is in the
      // foreground. That is not an app hand-off: preserve the in-flight native
      // biometric operation. The UI has a 90-second return grace; private
      // recovery sessions and transfer authorization NEVER inherit that grace.
      if (next === 'background') {
        if (previous !== 'background') {
          invalidateAuthorization();
          destroyActiveMainnetRecoverySecretSession();
          void cancelActiveBiometricAuthentication();
          dispatchSession({ type: 'BACKGROUND', now: Date.now() });
        }
        return;
      }
      if (previous !== 'active' && next === 'active') dispatchSession({ type: 'FOREGROUND', now: Date.now() });
    });
    const timer = setInterval(() => dispatchSession({ type: 'CHECK_TIMEOUT', now: Date.now() }), 15_000);
    return () => { invalidateAuthorization(); destroyActiveMainnetRecoverySecretSession(); subscription.remove(); clearInterval(timer); };
  }, [dispatchSession, invalidateAuthorization]);
  const lock = useCallback(() => dispatchSession({ type: 'LOCK' }), [dispatchSession]);
  const unlock = useCallback(() => { if (appStateRef.current !== 'background') dispatchSession({ type: 'UNLOCK', now: Date.now() }); }, [dispatchSession]);
  const recordActivity = useCallback(() => dispatchSession({ type: 'ACTIVITY', now: Date.now() }), [dispatchSession]);
  // Android reports `inactive` while a trusted system surface is taking focus
  // (for example BiometricPrompt). Only a genuine background transition
  // revokes the epoch above, so the synchronous check must use the same rule.
  const isAuthorizationActive = useCallback((epoch: number) => appStateRef.current !== 'background' && authorizationEpochRef.current === epoch && !lockedRef.current, []);
  const value = useMemo(() => ({ isLocked: state.status === 'locked', authorizationEpoch, isAuthorizationActive, lock, unlock, recordActivity }), [state.status, authorizationEpoch, isAuthorizationActive, lock, unlock, recordActivity]);
  return <MainnetSessionContext.Provider value={value}><View onTouchStart={recordActivity} style={{ flex: 1 }}>{children}</View></MainnetSessionContext.Provider>;
}

export function useMainnetSessionLock(): MainnetSessionValue {
  const value = useContext(MainnetSessionContext);
  if (!value) throw new Error('MainnetSessionLockProvider is required.');
  return value;
}
