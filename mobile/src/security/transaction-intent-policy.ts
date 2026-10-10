import { parseUnits, type Address } from 'viem';

import { getPublicAsset, type PublicAsset } from '@/config/assets';
import { normalizeAddress } from '@/utils/address';

export type TransactionIntentInput = {
  chainId: number;
  chainIsTestnet: boolean;
  signingEnabled: boolean;
  assetId: PublicAsset['id'];
  recipient: string;
  amount: string;
};

export type ValidatedTransactionIntent = {
  chainId: 97;
  asset: PublicAsset;
  recipient: Address;
  amount: bigint;
};

export type TransactionIntentResult =
  | { ok: true; intent: ValidatedTransactionIntent }
  | {
      ok: false;
      reason:
        | 'mainnet-blocked'
        | 'testnet-not-allowlisted'
        | 'signing-disabled'
        | 'asset-not-allowlisted'
        | 'invalid-recipient'
        | 'invalid-amount';
    };

/**
 * Validates a Testnet transfer for the review screen only. It intentionally
 * does not consult the signing feature gate: review must remain possible while
 * signing and broadcast are still disabled.
 */
export function validateTestnetTransactionReview(
  input: Omit<TransactionIntentInput, 'signingEnabled'>,
): TransactionIntentResult {
  if (!input.chainIsTestnet) return { ok: false, reason: 'mainnet-blocked' };
  if (input.chainId !== 97) return { ok: false, reason: 'testnet-not-allowlisted' };

  const asset = getPublicAsset(input.assetId);
  if (!asset) return { ok: false, reason: 'asset-not-allowlisted' };

  const recipient = normalizeAddress(input.recipient);
  if (!recipient.ok) return { ok: false, reason: 'invalid-recipient' };

  const amountText = input.amount.trim();
  if (!/^\d+(?:\.\d+)?$/.test(amountText)) return { ok: false, reason: 'invalid-amount' };
  try {
    const amount = parseUnits(amountText, asset.decimals);
    if (amount <= 0n) return { ok: false, reason: 'invalid-amount' };
    return { ok: true, intent: { chainId: 97, asset, recipient: recipient.address, amount } };
  } catch {
    return { ok: false, reason: 'invalid-amount' };
  }
}

/**
 * Validates display input only. This module has no account, key, client, signing,
 * transaction-broadcast, storage, or network dependency.
 */
export function validateTestnetTransactionIntent(
  input: TransactionIntentInput,
): TransactionIntentResult {
  if (!input.chainIsTestnet) return { ok: false, reason: 'mainnet-blocked' };
  if (input.chainId !== 97) return { ok: false, reason: 'testnet-not-allowlisted' };
  if (!input.signingEnabled) return { ok: false, reason: 'signing-disabled' };

  const asset = getPublicAsset(input.assetId);
  if (!asset) return { ok: false, reason: 'asset-not-allowlisted' };

  const recipient = normalizeAddress(input.recipient);
  if (!recipient.ok) return { ok: false, reason: 'invalid-recipient' };

  const amountText = input.amount.trim();
  if (!/^\d+(?:\.\d+)?$/.test(amountText)) return { ok: false, reason: 'invalid-amount' };
  try {
    const amount = parseUnits(amountText, asset.decimals);
    if (amount <= 0n) return { ok: false, reason: 'invalid-amount' };
    return {
      ok: true,
      intent: { chainId: 97, asset, recipient: recipient.address, amount },
    };
  } catch {
    return { ok: false, reason: 'invalid-amount' };
  }
}
