import { createContext, useContext, useMemo, useReducer, type PropsWithChildren } from 'react';

import {
  INITIAL_MAINNET_ONBOARDING_STATE,
  transitionMainnetOnboarding,
  type MainnetOnboardingEvent,
  type MainnetOnboardingState,
} from './mainnet-onboarding-machine';

type MainnetOnboardingContextValue = { state: MainnetOnboardingState; dispatch: (event: MainnetOnboardingEvent) => void };
const MainnetOnboardingContext = createContext<MainnetOnboardingContextValue | null>(null);

export function MainnetOnboardingProvider({ children }: PropsWithChildren) {
  const [state, dispatch] = useReducer(transitionMainnetOnboarding, INITIAL_MAINNET_ONBOARDING_STATE);
  const value = useMemo(() => ({ state, dispatch }), [state]);
  return <MainnetOnboardingContext.Provider value={value}>{children}</MainnetOnboardingContext.Provider>;
}

export function useMainnetOnboarding(): MainnetOnboardingContextValue {
  const value = useContext(MainnetOnboardingContext);
  if (!value) throw new Error('MainnetOnboardingProvider is required.');
  return value;
}
