import { describe, expect, it } from 'vitest';

import { INITIAL_TESTNET_SEND_FLOW_STATE, transitionTestnetSendFlow } from './testnet-send-flow-state';

const draft = {
  expectedAddress: '0x1111111111111111111111111111111111111111' as const,
  gasPriceWei: 1n,
  nativeBalanceWei: 1n,
  intent: {
    chainId: 97 as const,
    asset: { id: 'arxi' as const, kind: 'bep20' as const, name: 'AurionXI', symbol: 'ARXI', decimals: 18, accent: '#7cf6bd', address: '0x3A3f02F22a6Cf16122A7C752B73E65E05Df466fA' as const },
    recipient: '0x2222222222222222222222222222222222222222' as const,
    amount: 1n,
  },
};

describe('Testnet send flow state', () => {
  it('holds one reviewed public draft in memory and resets it', () => {
    const started = transitionTestnetSendFlow(INITIAL_TESTNET_SEND_FLOW_STATE, { type: 'BEGIN', draft });
    expect(started).toMatchObject({ stage: 'reviewed', draft: { expectedAddress: draft.expectedAddress } });
    expect(transitionTestnetSendFlow(started, { type: 'RESET' })).toEqual(INITIAL_TESTNET_SEND_FLOW_STATE);
  });
});
