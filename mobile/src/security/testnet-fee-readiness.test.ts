import { describe, expect, it } from 'vitest';

import { evaluateTestnetFeeReadiness, TESTNET_NATIVE_TRANSFER_GAS_LIMIT, TESTNET_TOKEN_TRANSFER_GAS_LIMIT } from './testnet-fee-readiness';
import { validateTestnetTransactionIntent } from './transaction-intent-policy';

function intent(assetId: 'native-bnb' | 'arxi') {
  const result = validateTestnetTransactionIntent({ chainId: 97, chainIsTestnet: true, signingEnabled: true, assetId, recipient: '0x1111111111111111111111111111111111111111', amount: '0.01' });
  if (!result.ok) throw new Error('Fixture must be valid.');
  return result.intent;
}

describe('Testnet fee readiness', () => {
  it('does not invent a fee while public gas data is absent', () => {
    expect(evaluateTestnetFeeReadiness({ intent: intent('arxi') })).toMatchObject({ state: 'unavailable' });
  });

  it('reserves fee plus amount for a native transfer', () => {
    const result = evaluateTestnetFeeReadiness({ intent: intent('native-bnb'), nativeBalanceWei: 20_000_000_000_000_000n, gasPriceWei: 1_000_000_000n });
    expect(result).toMatchObject({ state: 'ready', gasLimit: TESTNET_NATIVE_TRANSFER_GAS_LIMIT, feeWei: 21_000_000_000_000n });
  });

  it('reserves only tBNB fee for a token transfer and warns when unavailable', () => {
    const ready = evaluateTestnetFeeReadiness({ intent: intent('arxi'), nativeBalanceWei: 200_000_000_000_000n, gasPriceWei: 1_000_000_000n });
    expect(ready).toMatchObject({ state: 'ready', gasLimit: TESTNET_TOKEN_TRANSFER_GAS_LIMIT, feeWei: 160_000_000_000_000n });
    const blocked = evaluateTestnetFeeReadiness({ intent: intent('arxi'), nativeBalanceWei: 1n, gasPriceWei: 1_000_000_000n });
    expect(blocked).toMatchObject({ state: 'insufficient-native-balance' });
  });

  it('blocks a token transfer before signing when the current token balance is too low', () => {
    const result = evaluateTestnetFeeReadiness({
      intent: intent('arxi'),
      nativeBalanceWei: 1_000_000_000_000_000n,
      gasPriceWei: 1_000_000_000n,
      assetBalanceWei: 1n,
    });
    expect(result).toMatchObject({ state: 'insufficient-asset-balance', availableAssetWei: 1n });
  });
});
