import { formatUnits } from 'viem';

import type { ValidatedTransactionIntent } from './transaction-intent-policy';

export const TESTNET_NATIVE_TRANSFER_GAS_LIMIT = 21_000n;
/**
 * Conservative BSC Testnet token-transfer limit.
 *
 * A real ARXI Testnet transfer was estimated at 129,635 gas. The previous
 * 65,000 gas limit could exhaust gas inside TokenDiamond's validation call
 * and surface as a misleading validation failure. Keep a rounded safety
 * buffer until the relay exposes a signed-payload gas-estimation endpoint.
 */
export const TESTNET_TOKEN_TRANSFER_GAS_LIMIT = 160_000n;

export type TestnetFeeReadiness =
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
 * Evaluates a supplied public gas-price snapshot. The caller must obtain that
 * snapshot separately; this pure module performs no RPC request, signing,
 * transaction broadcast, credential access, or storage write.
 */
export function evaluateTestnetFeeReadiness(input: {
  intent: ValidatedTransactionIntent;
  nativeBalanceWei?: bigint;
  gasPriceWei?: bigint;
  assetBalanceWei?: bigint;
}): TestnetFeeReadiness {
  if (input.nativeBalanceWei === undefined || input.gasPriceWei === undefined || input.gasPriceWei <= 0n) {
    return { state: 'unavailable', message: 'Network fee is not available yet. Refresh public Testnet data before confirming.' };
  }
  const gasLimit = input.intent.asset.kind === 'native'
    ? TESTNET_NATIVE_TRANSFER_GAS_LIMIT
    : TESTNET_TOKEN_TRANSFER_GAS_LIMIT;
  const feeWei = gasLimit * input.gasPriceWei;
  const requiredNativeWei = feeWei + (input.intent.asset.kind === 'native' ? input.intent.amount : 0n);
  const feeLabel = `${trimNative(formatUnits(feeWei, 18))} tBNB`;

  if (input.intent.asset.kind !== 'native' && input.assetBalanceWei !== undefined && input.assetBalanceWei < input.intent.amount) {
    return {
      state: 'insufficient-asset-balance',
      gasLimit,
      gasPriceWei: input.gasPriceWei,
      feeWei,
      feeLabel,
      requiredAssetWei: input.intent.amount,
      availableAssetWei: input.assetBalanceWei,
    };
  }

  if (input.nativeBalanceWei < requiredNativeWei) {
    return {
      state: 'insufficient-native-balance',
      gasLimit,
      gasPriceWei: input.gasPriceWei,
      feeWei,
      feeLabel,
      requiredNativeWei,
      availableNativeWei: input.nativeBalanceWei,
    };
  }
  return {
    state: 'ready',
    gasLimit,
    gasPriceWei: input.gasPriceWei,
    feeWei,
    feeLabel,
    remainingNativeWei: input.nativeBalanceWei - requiredNativeWei,
  };
}

function trimNative(value: string): string {
  const trimmed = value.replace(/(?:\.0+|(?:(\.\d*?[1-9]))0+)$/, '$1');
  return trimmed === '' ? '0' : trimmed;
}
