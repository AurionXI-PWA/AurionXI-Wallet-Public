import { describe, expect, it } from 'vitest';

import { validateTestnetTransactionIntent } from './transaction-intent-policy';
import {
  authorizeSyntheticTestnetBroadcast,
  isSyntheticTestnetBroadcastAuthorizationActive,
  SYNTHETIC_TESTNET_CONFIRMATION,
} from './synthetic-testnet-broadcast-authorization';

function getIntent(amount = '0.01') {
  const result = validateTestnetTransactionIntent({
    chainId: 97, chainIsTestnet: true, signingEnabled: true, assetId: 'arxi',
    recipient: '0x1111111111111111111111111111111111111111', amount,
  });
  if (!result.ok) throw new Error('test intent failed validation');
  return result.intent;
}

const base = {
  debugBuild: true,
  walletSecretsEnabled: true,
  signingEnabled: true,
  confirmation: SYNTHETIC_TESTNET_CONFIRMATION,
  now: 1_000,
  intent: getIntent(),
};

describe('synthetic Testnet broadcast authorization', () => {
  it('issues a short-lived ARXI-only authorization after exact confirmation', () => {
    const result = authorizeSyntheticTestnetBroadcast(base);
    if (!result.ok) throw new Error('authorization unexpectedly failed');
    expect(result.authorization.expiresAt).toBe(61_000);
    expect(isSyntheticTestnetBroadcastAuthorizationActive(result.authorization, 60_999)).toBe(true);
    expect(isSyntheticTestnetBroadcastAuthorizationActive(result.authorization, 61_000)).toBe(false);
  });

  it('rejects missing security gates, altered confirmation, and over-cap amounts', () => {
    expect(authorizeSyntheticTestnetBroadcast({ ...base, debugBuild: false })).toEqual({
      ok: false, reason: 'debug-build-required',
    });
    expect(authorizeSyntheticTestnetBroadcast({ ...base, confirmation: 'confirm' })).toEqual({
      ok: false, reason: 'confirmation-mismatch',
    });
    expect(authorizeSyntheticTestnetBroadcast({ ...base, intent: getIntent('0.100000000000000001') })).toEqual({
      ok: false, reason: 'amount-above-test-cap',
    });
  });
});
