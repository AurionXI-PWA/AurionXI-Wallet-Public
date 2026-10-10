import type { Address } from 'viem';

import type { ValidatedTransactionIntent } from './transaction-intent-policy';

export type TestnetSendDraft = {
  expectedAddress: Address;
  gasPriceWei: bigint;
  intent: ValidatedTransactionIntent;
  nativeBalanceWei: bigint;
};

export type TestnetSendFlowState =
  | { stage: 'idle' }
  | { stage: 'reviewed'; draft: TestnetSendDraft };

export type TestnetSendFlowEvent =
  | { type: 'BEGIN'; draft: TestnetSendDraft }
  | { type: 'RESET' };

export const INITIAL_TESTNET_SEND_FLOW_STATE: TestnetSendFlowState = { stage: 'idle' };

/**
 * In-memory only and never contains secret material. A brief app switch keeps
 * the reviewed draft available; session-lock and short-lived broadcast gates
 * still protect signing and any later network action.
 */
export function transitionTestnetSendFlow(
  state: TestnetSendFlowState,
  event: TestnetSendFlowEvent,
): TestnetSendFlowState {
  if (event.type === 'RESET') return INITIAL_TESTNET_SEND_FLOW_STATE;
  if (state.stage !== 'idle') return state;
  return { stage: 'reviewed', draft: event.draft };
}
