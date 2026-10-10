import { describe, expect, it } from 'vitest';

import { evaluateMainnetSendSignBoundary } from './mainnet-send-sign-boundary';

describe('Mainnet send and sign boundary', () => {
  it('blocks review before a separate Mainnet vault exists', () => {
    expect(evaluateMainnetSendSignBoundary({ stage: 'review', mainnetVaultPresent: false })).toEqual({ allowed: false, stage: 'review', reason: 'mainnet-wallet-not-created' });
  });

  it.each(['review', 'sign', 'broadcast'] as const)('blocks Mainnet %s even when a vault exists', (stage) => {
    expect(evaluateMainnetSendSignBoundary({ stage, mainnetVaultPresent: true })).toEqual({ allowed: false, stage, reason: 'mainnet-signing-not-released' });
  });
});
