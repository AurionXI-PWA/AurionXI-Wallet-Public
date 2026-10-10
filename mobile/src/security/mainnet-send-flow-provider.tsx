import { createContext, type PropsWithChildren, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import { MainnetProductionCoordinator } from './mainnet-production-coordinator';
import type { ExtractMainnetReview } from './mainnet-send-flow-types';
import { useMainnetSessionLock } from './mainnet-session-lock-provider';
import type { MainnetTrustedQuote } from './mainnet-trusted-quote';
import { invalidateNativeMainnetAuthorizations } from './mainnet-native-authorization-boundary';

type MainnetSendFlowValue = {
  review: ExtractMainnetReview | null;
  quote: MainnetTrustedQuote | null;
  productionCoordinator: MainnetProductionCoordinator;
  setReview: (review: ExtractMainnetReview) => void;
  setQuote: (quote: MainnetTrustedQuote) => void;
  clear: () => void;
};

const MainnetSendFlowContext = createContext<MainnetSendFlowValue | null>(null);

/** Stores only the current immutable public review in memory for one secure-confirmation journey. */
export function MainnetSendFlowProvider({ children }: PropsWithChildren) {
  const { authorizationEpoch, isLocked } = useMainnetSessionLock();
  const [productionCoordinator] = useState(() => new MainnetProductionCoordinator());
  const [review, setReviewState] = useState<ExtractMainnetReview | null>(null);
  const [quote, setQuoteState] = useState<MainnetTrustedQuote | null>(null);
  const setReview = useCallback((next: ExtractMainnetReview) => { productionCoordinator.invalidate(); void invalidateNativeMainnetAuthorizations(); setReviewState(next); }, [productionCoordinator]);
  const setQuote = useCallback((next: MainnetTrustedQuote) => { productionCoordinator.invalidate(); void invalidateNativeMainnetAuthorizations(); setReviewState(null); setQuoteState(next); }, [productionCoordinator]);
  const clear = useCallback(() => { productionCoordinator.invalidate(); void invalidateNativeMainnetAuthorizations(); setReviewState(null); setQuoteState(null); }, [productionCoordinator]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      // Android may report inactive while its own BiometricPrompt is visible.
      // A real background always destroys the pending signature and approval.
      if (next === 'background') clear();
    });
    return () => subscription.remove();
  }, [clear]);
  useEffect(() => { productionCoordinator.invalidate(); }, [authorizationEpoch, isLocked, productionCoordinator]);
  useEffect(() => () => productionCoordinator.invalidate(), [productionCoordinator]);
  const value = useMemo(() => ({ review, quote, productionCoordinator, setReview, setQuote, clear }), [review, quote, productionCoordinator, setReview, setQuote, clear]);
  return <MainnetSendFlowContext.Provider value={value}>{children}</MainnetSendFlowContext.Provider>;
}

export function useMainnetSendFlow(): MainnetSendFlowValue {
  const value = useContext(MainnetSendFlowContext);
  if (!value) throw new Error('MainnetSendFlowProvider is required.');
  return value;
}
