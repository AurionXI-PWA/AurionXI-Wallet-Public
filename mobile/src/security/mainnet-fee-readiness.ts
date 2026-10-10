import { formatUnits } from 'viem';

import type { ValidatedMainnetTransactionIntent } from './mainnet-transaction-intent-policy';

export const MAINNET_NATIVE_TRANSFER_GAS_LIMIT = 21_000n;
export const MAINNET_TOKEN_TRANSFER_GAS_LIMIT = 160_000n;

export type MainnetFeeReadiness =
  | { state: 'unavailable'; message: string }
  | {
      state: 'ready';
      gasLimit: bigint;
      gasPriceWei: bigint;
      feeWei: bigint;
      feeLabel: string;
      remainingNativeWei: bigint;
    }
  | {
      state: 'insufficient-native-balance';
      gasLimit: bigint;
      gasPriceWei: bigint;
      feeWei: bigint;
      feeLabel: string;
      requiredNativeWei: bigint;
      availableNativeWei: bigint;
    }
  | {
      state: 'insufficient-asset-balance';
      gasLimit: bigint;
      gasPriceWei: bigint;
      feeWei: bigint;
      feeLabel: string;
      requiredAssetWei: bigint;
      availableAssetWei: bigint;
    };

/**
 * Pure future-review calculation. The caller must provide public snapshot
 * values from a separately approved read path. This module never fetches,
 * signs, broadcasts, reads secrets, or persists state.
 */
export function evaluateMainnetFeeReadiness(input: {
  intent: ValidatedMainnetTransactionIntent;
  nativeBalanceWei?: bigint;
  gasPriceWei?: bigint;
  assetBalanceWei?: bigint;
}): MainnetFeeReadiness {
  if (input.nativeBalanceWei === undefined || input.gasPriceWei === undefined || input.gasPriceWei <= 0n) {
    return { state: 'unavailable', message: 'Network fee is not available yet. Refresh public network data before reviewing.' };
  }
  // USDT Send cannot proceed against an older portfolio without its token balance.
  if (input.intent.asset.id === 'usdt' && input.assetBalanceWei === undefined) {
    return { state: 'unavailable', message: 'The USDT balance is unavailable. Refresh the Mainnet portfolio before sending.' };
  }
  const gasLimit = input.intent.asset.kind === 'native'
    ? MAINNET_NATIVE_TRANSFER_GAS_LIMIT
    : MAINNET_TOKEN_TRANSFER_GAS_LIMIT;
  const feeWei = gasLimit * input.gasPriceWei;
  const requiredNativeWei = feeWei + (input.intent.asset.kind === 'native' ? input.intent.amount : 0n);
  const feeLabel = `${trimNative(formatUnits(feeWei, 18))} BNB`;

  if (input.intent.asset.kind !== 'native' && input.assetBalanceWei !== undefined && input.assetBalanceWei < input.intent.amount) {
    return { state: 'insufficient-asset-balance', gasLimit, gasPriceWei: input.gasPriceWei, feeWei, feeLabel, requiredAssetWei: input.intent.amount, availableAssetWei: input.assetBalanceWei };
  }
  if (input.nativeBalanceWei < requiredNativeWei) {
    return { state: 'insufficient-native-balance', gasLimit, gasPriceWei: input.gasPriceWei, feeWei, feeLabel, requiredNativeWei, availableNativeWei: input.nativeBalanceWei };
  }
  return { state: 'ready', gasLimit, gasPriceWei: input.gasPriceWei, feeWei, feeLabel, remainingNativeWei: input.nativeBalanceWei - requiredNativeWei };
}

function trimNative(value: string): string {
  const trimmed = value.replace(/(?:\.0+|(?:(\.\d*?[1-9]))0+)$/, '$1');
  return trimmed === '' ? '0' : trimmed;
}
