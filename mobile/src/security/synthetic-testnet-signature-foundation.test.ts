import { verifyMessage } from 'viem';
import { describe, expect, it } from 'vitest';

import { validateTestnetTransactionIntent } from './transaction-intent-policy';
import {
  createSyntheticTestnetPreparedPayloadSignature,
  createSyntheticTestnetReviewSignature,
  getSyntheticTestnetPreparedPayloadReviewMessage,
} from './synthetic-testnet-signature-foundation';
import { authorizeSyntheticTestnetBroadcast, SYNTHETIC_TESTNET_CONFIRMATION } from './synthetic-testnet-broadcast-authorization';
import { prepareSyntheticTestnetArxiTransfer } from './synthetic-testnet-transfer-builder';

function getIntent() {
  const result = validateTestnetTransactionIntent({
    chainId: 97,
    chainIsTestnet: true,
    signingEnabled: true,
    assetId: 'arxi',
    recipient: '0x1111111111111111111111111111111111111111',
    amount: '0.01',
  });
  if (!result.ok) throw new Error('test intent failed validation');
  return result.intent;
}

describe('synthetic Testnet signature foundation', () => {
  it('creates a locally verifiable review signature for an ephemeral synthetic account', async () => {
    const result = await createSyntheticTestnetReviewSignature({
      debugBuild: true, walletSecretsEnabled: true, signingEnabled: true, intent: getIntent(),
    });

    expect(result.message).toContain('Chain ID: 97');
    expect(result.message).toContain('local signature only; no transaction authorization');
    await expect(verifyMessage(result)).resolves.toBe(true);
  });

  it('fails closed unless every synthetic Testnet prerequisite is supplied', async () => {
    await expect(createSyntheticTestnetReviewSignature({
      debugBuild: false, walletSecretsEnabled: true, signingEnabled: true, intent: getIntent(),
    })).rejects.toThrow('debug builds');
    await expect(createSyntheticTestnetReviewSignature({
      debugBuild: true, walletSecretsEnabled: false, signingEnabled: true, intent: getIntent(),
    })).rejects.toThrow('wallet-secret');
    await expect(createSyntheticTestnetReviewSignature({
      debugBuild: true, walletSecretsEnabled: true, signingEnabled: false, intent: getIntent(),
    })).rejects.toThrow('signing is disabled');
  });

  it('binds a local signature to one exact prepared payload', async () => {
    const intent = getIntent();
    const authorization = authorizeSyntheticTestnetBroadcast({
      debugBuild: true, walletSecretsEnabled: true, signingEnabled: true,
      confirmation: SYNTHETIC_TESTNET_CONFIRMATION, now: 1_000, intent,
    });
    if (!authorization.ok) throw new Error('test authorization failed');
    const payload = prepareSyntheticTestnetArxiTransfer({
      authorization: authorization.authorization, intent, now: 2_000,
    });
    const signature = await createSyntheticTestnetPreparedPayloadSignature({
      debugBuild: true, walletSecretsEnabled: true, signingEnabled: true, payload,
    });
    await expect(verifyMessage(signature)).resolves.toBe(true);
    await expect(verifyMessage({
      ...signature,
      message: getSyntheticTestnetPreparedPayloadReviewMessage({ ...payload, data: `${payload.data}00` }),
    })).resolves.toBe(false);
  });
});
