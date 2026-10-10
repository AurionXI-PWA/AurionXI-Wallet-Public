import { describe, expect, it } from 'vitest';

import { authorizeTestnetSend } from './testnet-send-authorization';
import { prepareTestnetTransfer } from './testnet-transfer-builder';
import { validateTestnetTransactionIntent } from './transaction-intent-policy';

function reviewed(assetId: 'native-bnb' | 'arxi' | 'usdt') {
  const result = validateTestnetTransactionIntent({ chainId: 97, chainIsTestnet: true, signingEnabled: true, assetId, recipient: '0x1111111111111111111111111111111111111111', amount: '0.01' });
  if (!result.ok) throw new Error('Test fixture must be valid.');
  return result.intent;
}

describe('Testnet transfer builder', () => {
  it('builds an unsigned native tBNB payload', () => {
    const intent = reviewed('native-bnb');
    const authorized = authorizeTestnetSend({ vaultUnlocked: true, walletSecretsEnabled: true, signingEnabled: true, reviewConfirmed: true, now: 0, intent });
    if (!authorized.ok) throw new Error('Test fixture must authorize.');
    expect(prepareTestnetTransfer({ authorization: authorized.authorization, intent, now: 1 })).toMatchObject({ chainId: 97, to: intent.recipient, data: '0x', value: intent.amount });
  });

  it('builds an unsigned BEP-20 payload without an account or network client', () => {
    const intent = reviewed('usdt');
    const authorized = authorizeTestnetSend({ vaultUnlocked: true, walletSecretsEnabled: true, signingEnabled: true, reviewConfirmed: true, now: 0, intent });
    if (!authorized.ok) throw new Error('Test fixture must authorize.');
    const payload = prepareTestnetTransfer({ authorization: authorized.authorization, intent, now: 1 });
    expect(payload).toMatchObject({ chainId: 97, to: intent.asset.address, value: 0n });
    expect(payload.data).toMatch(/^0xa9059cbb/);
  });
});
