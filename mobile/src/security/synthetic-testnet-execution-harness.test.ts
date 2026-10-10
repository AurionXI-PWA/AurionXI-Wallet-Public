import { describe, expect, it, vi } from 'vitest';

import { authorizeSyntheticTestnetBroadcast, SYNTHETIC_TESTNET_CONFIRMATION } from './synthetic-testnet-broadcast-authorization';
import { validateTestnetTransactionIntent } from './transaction-intent-policy';
import { executeSyntheticTestnetHarness } from './synthetic-testnet-execution-harness';
import { prepareSyntheticTestnetArxiTransfer } from './synthetic-testnet-transfer-builder';

function setup() {
  const validated = validateTestnetTransactionIntent({
    chainId: 97, chainIsTestnet: true, signingEnabled: true, assetId: 'arxi',
    recipient: '0x1111111111111111111111111111111111111111', amount: '0.01',
  });
  if (!validated.ok) throw new Error('test intent failed');
  const authorizationResult = authorizeSyntheticTestnetBroadcast({
    debugBuild: true, walletSecretsEnabled: true, signingEnabled: true,
    confirmation: SYNTHETIC_TESTNET_CONFIRMATION, now: 1_000, intent: validated.intent,
  });
  if (!authorizationResult.ok) throw new Error('test authorization failed');
  return {
    authorization: authorizationResult.authorization,
    payload: prepareSyntheticTestnetArxiTransfer({
      authorization: authorizationResult.authorization, intent: validated.intent, now: 2_000,
    }),
  };
}

describe('synthetic Testnet execution harness', () => {
  it('calls only an injected mocked broadcaster after signature verification', async () => {
    const { authorization, payload } = setup();
    const broadcast = vi.fn().mockResolvedValue({ hash: `0x${'a'.repeat(64)}`, status: 'accepted' as const });
    const result = await executeSyntheticTestnetHarness({
      authorization, payload, signature: {} as never, now: 2_000,
      dependencies: { verifyPayloadSignature: vi.fn().mockResolvedValue(true), broadcaster: { broadcast } },
    });
    expect(result).toEqual({ ok: true, receipt: { hash: `0x${'a'.repeat(64)}`, status: 'accepted' } });
    expect(broadcast).toHaveBeenCalledWith(payload);
  });

  it('fails closed before the mock broadcaster for expired or invalid authorization', async () => {
    const { authorization, payload } = setup();
    const broadcast = vi.fn();
    const dependencies = { verifyPayloadSignature: vi.fn().mockResolvedValue(false), broadcaster: { broadcast } };
    await expect(executeSyntheticTestnetHarness({ authorization, payload, signature: {} as never, now: 2_000, dependencies })).resolves.toEqual({
      ok: false, reason: 'signature-invalid',
    });
    await expect(executeSyntheticTestnetHarness({ authorization, payload, signature: {} as never, now: 61_000, dependencies })).resolves.toEqual({
      ok: false, reason: 'authorization-expired',
    });
    expect(broadcast).not.toHaveBeenCalled();
  });
});
