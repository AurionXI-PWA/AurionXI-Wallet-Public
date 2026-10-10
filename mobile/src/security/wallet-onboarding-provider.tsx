import {
  createContext,
  type Dispatch,
  type PropsWithChildren,
  useContext,
  useEffect,
  useMemo,
  useReducer,
} from 'react';
import { AppState } from 'react-native';

import {
  INITIAL_ONBOARDING_STATE,
  transitionWalletOnboarding,
  type WalletOnboardingEvent,
  type WalletOnboardingState,
} from './wallet-onboarding-machine';

type WalletOnboardingContextValue = {
  dispatch: Dispatch<WalletOnboardingEvent>;
  state: WalletOnboardingState;
};

const WalletOnboardingContext = createContext<WalletOnboardingContextValue | null>(null);

export function WalletOnboardingProvider({ children }: PropsWithChildren) {
  const [state, dispatch] = useReducer(
    transitionWalletOnboarding,
    INITIAL_ONBOARDING_STATE,
  );
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active') dispatch({ type: 'RESET' });
    });
    return () => subscription.remove();
  }, []);
  const value = useMemo(() => ({ dispatch, state }), [state]);

  return (
    <WalletOnboardingContext.Provider value={value}>
      {children}
    </WalletOnboardingContext.Provider>
  );
}

export function useWalletOnboarding() {
  const value = useContext(WalletOnboardingContext);
  if (!value) {
    throw new Error('useWalletOnboarding must be used within WalletOnboardingProvider.');
  }
  return value;
}
