import { decodeFunctionData } from 'viem';
import { describe, expect, it } from 'vitest';

import { authorizeSyntheticTestnetBroadcast, SYNTHETIC_TESTNET_CONFIRMATION } from './synthetic-testnet-broadcast-authorization';
import { validateTestnetTransactionIntent } from './transaction-intent-policy';
import { prepareSyntheticTestnetArxiTransfer } from './synthetic-testnet-transfer-builder';

function getIntent(amount = '0.01') {
  const result = validateTestnetTransactionIntent({
    chainId: 97, chainIsTestnet: true, signingEnabled: true, assetId: 'arxi',
    recipient: '0x1111111111111111111111111111111111111111', amount,
  });
  if (!result.ok) throw new Error('test intent failed validation');
  return result.intent;
}

function getAuthorization(intent = getIntent()) {
  const result = authorizeSyntheticTestnetBroadcast({
    debugBuild: true, walletSecretsEnabled: true, signingEnabled: true,
    confirmation: SYNTHETIC_TESTNET_CONFIRMATION, now: 1_000, intent,
  });
  if (!result.ok) throw new Error('test authorization failed');
  return result.authorization;
}

describe('synthetic Testnet ARXI transfer builder', () => {
  it('prepares one unsigned ARXI transfer matching the active reviewed intent', () => {
    const intent = getIntent();
    const prepared = prepareSyntheticTestnetArxiTransfer({
      authorization: getAuthorization(intent), intent, now: 60_999,
    });
    expect(prepared).toMatchObject({ chainId: 97, to: intent.asset.address, value: 0n });
    expect(decodeFunctionData({
      abi: [{ type: 'function', name: 'transfer', stateMutability: 'nonpayable', inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }] }],
      data: prepared.data,
    })).toMatchObject({ functionName: 'transfer', args: [intent.recipient, intent.amount] });
  });

  it('rejects expired and altered authorization/intent pairs', () => {
    const intent = getIntent();
    expect(() => prepareSyntheticTestnetArxiTransfer({
      authorization: getAuthorization(intent), intent, now: 61_000,
    })).toThrow('expired');
    expect(() => prepareSyntheticTestnetArxiTransfer({
      authorization: getAuthorization(intent), intent: getIntent('0.02'), now: 2_000,
    })).toThrow('does not match');
  });
});
