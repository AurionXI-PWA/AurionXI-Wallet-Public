import { createContext, type PropsWithChildren, useContext, useMemo, useReducer } from 'react';

import {
  INITIAL_TESTNET_SEND_FLOW_STATE,
  transitionTestnetSendFlow,
  type TestnetSendDraft,
  type TestnetSendFlowState,
} from './testnet-send-flow-state';

type TestnetSendFlowContextValue = {
  begin: (draft: TestnetSendDraft) => void;
  reset: () => void;
  state: TestnetSendFlowState;
};

const TestnetSendFlowContext = createContext<TestnetSendFlowContextValue | null>(null);

export function TestnetSendFlowProvider({ children }: PropsWithChildren) {
  const [state, dispatch] = useReducer(transitionTestnetSendFlow, INITIAL_TESTNET_SEND_FLOW_STATE);
  const value = useMemo(() => ({
    begin: (draft: TestnetSendDraft) => dispatch({ type: 'BEGIN', draft }),
    reset: () => dispatch({ type: 'RESET' }),
    state,
  }), [state]);
  return <TestnetSendFlowContext.Provider value={value}>{children}</TestnetSendFlowContext.Provider>;
}

export function useTestnetSendFlow() {
  const value = useContext(TestnetSendFlowContext);
  if (!value) throw new Error('useTestnetSendFlow must be used within TestnetSendFlowProvider.');
  return value;
}
