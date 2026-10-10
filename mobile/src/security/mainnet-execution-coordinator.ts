import {
  evaluateMainnetFeeReadiness,
  type MainnetFeeReadiness,
} from './mainnet-fee-readiness';
import {
  createMainnetReviewEnvelope,
  type MainnetPublicTransactionSnapshot,
  type MainnetReviewEnvelope,
} from './mainnet-review-envelope';
import {
  evaluateMainnetSecureConfirmation,
  type MainnetSecureConfirmation,
  type MainnetSecureConfirmationResult,
} from './mainnet-secure-confirmation';
import {
  validateMainnetTransactionReview,
  type MainnetTransactionIntentInput,
  type ValidatedMainnetTransactionIntent,
} from './mainnet-transaction-intent-policy';
import type { Address } from 'viem';

export type MainnetExecutionSnapshot = Omit<MainnetPublicTransactionSnapshot, 'gasPriceWei'> & {
  gasPriceWei?: bigint;
  nativeBalanceWei?: bigint;
  assetBalanceWei?: bigint;
};

export type MainnetExecutionPreparation =
  | { state: 'invalid-details'; reason: 'asset-not-configured' | 'invalid-recipient' | 'invalid-amount' }
  | { state: 'fee-unavailable'; fee: MainnetFeeReadiness }
  | { state: 'insufficient-native-balance'; fee: MainnetFeeReadiness }
  | { state: 'insufficient-asset-balance'; fee: MainnetFeeReadiness }
  | {
      state: 'review-ready';
      intent: ValidatedMainnetTransactionIntent;
      fee: Extract<MainnetFeeReadiness, { state: 'ready' }>;
      review: MainnetReviewEnvelope;
    };

/**
 * One pure orchestration point for the Mainnet execution journey:
 * transfer details -> public network snapshot -> immutable review envelope.
 *
 * It intentionally accepts only caller-supplied public values. It cannot
 * access a vault, recovery phrase, PIN, biometric data, RPC client, storage,
 * signer, or broadcaster. A later, separately reviewed release gate remains
 * responsible for any real Mainnet signing or broadcast capability.
 */
export function prepareMainnetExecution(input: {
  senderAddress: Address;
  transaction: MainnetTransactionIntentInput;
  snapshot: MainnetExecutionSnapshot;
}): MainnetExecutionPreparation {
  const validated = validateMainnetTransactionReview(input.transaction);
  if (!validated.ok) return { state: 'invalid-details', reason: validated.reason };

  if (input.snapshot.gasPriceWei === undefined) {
    return {
      state: 'fee-unavailable',
      fee: { state: 'unavailable', message: 'Network fee is not available yet. Refresh public network data before reviewing.' },
    };
  }

  const fee = evaluateMainnetFeeReadiness({
    intent: validated.intent,
    nativeBalanceWei: input.snapshot.nativeBalanceWei,
    gasPriceWei: input.snapshot.gasPriceWei,
    assetBalanceWei: input.snapshot.assetBalanceWei,
  });

  if (fee.state === 'unavailable') return { state: 'fee-unavailable', fee };
  if (fee.state === 'insufficient-native-balance') return { state: 'insufficient-native-balance', fee };
  if (fee.state === 'insufficient-asset-balance') return { state: 'insufficient-asset-balance', fee };

  return {
    state: 'review-ready',
    intent: validated.intent,
    fee,
    review: createMainnetReviewEnvelope({
      senderAddress: input.senderAddress,
      intent: validated.intent,
      snapshot: { chainId: input.snapshot.chainId, nonce: input.snapshot.nonce, gasPriceWei: input.snapshot.gasPriceWei, observedAt: input.snapshot.observedAt },
      fee,
    }),
  };
}

export type MainnetExecutionConfirmation =
  | { state: 'review-not-ready' }
  | { state: 'confirmation-result'; result: MainnetSecureConfirmationResult };

/**
 * Applies a fresh device-local confirmation to the exact review envelope.
 * The underlying confirmation policy remains hard-default-deny for Mainnet
 * signing and broadcasting in the current preview release.
 */
export function confirmPreparedMainnetExecution(input: {
  preparation: MainnetExecutionPreparation;
  mainnetVaultPresent: boolean;
  vaultUnlocked: boolean;
  confirmation: MainnetSecureConfirmation;
  now: number;
}): MainnetExecutionConfirmation {
  if (input.preparation.state !== 'review-ready') return { state: 'review-not-ready' };
  return {
    state: 'confirmation-result',
    result: evaluateMainnetSecureConfirmation({
      mainnetVaultPresent: input.mainnetVaultPresent,
      vaultUnlocked: input.vaultUnlocked,
      confirmation: input.confirmation,
      review: input.preparation.review,
      now: input.now,
    }),
  };
}
