import { parseUnits, type Address } from 'viem';

import { getAssetTargetsForNetwork, type NetworkAssetTarget } from '@/config/asset-targets';
import { NETWORK_TARGETS } from '@/config/network-targets';
import { normalizeAddress } from '@/utils/address';

export type MainnetTransactionIntentInput = {
  assetId: NetworkAssetTarget['id'];
  recipient: string;
  amount: string;
};

export type ValidatedMainnetTransactionIntent = {
  chainId: 56;
  asset: NetworkAssetTarget;
  recipient: Address;
  amount: bigint;
};

export type MainnetTransactionIntentResult =
  | { ok: true; intent: ValidatedMainnetTransactionIntent }
  | { ok: false; reason: 'asset-not-configured' | 'invalid-recipient' | 'invalid-amount' };

/**
 * Validates Mainnet transfer details for a future review-only flow.
 *
 * This is intentionally a pure parser: it neither discovers accounts nor
 * accesses a vault, key, RPC endpoint, storage, signing adapter, or relay.
 * A separate hard-default-deny boundary controls all Mainnet sign/broadcast
 * capability.
 */
export function validateMainnetTransactionReview(
  input: MainnetTransactionIntentInput,
): MainnetTransactionIntentResult {
  const asset = getAssetTargetsForNetwork(NETWORK_TARGETS.mainnet).find((candidate) => candidate.id === input.assetId);
  // A token needs a reviewed contract address before it can enter any future
  // transfer-review model. Native BNB has no token contract by design.
  if (!asset || (asset.kind === 'bep20' && !asset.address)) {
    return { ok: false, reason: 'asset-not-configured' };
  }

  const recipient = normalizeAddress(input.recipient);
  if (!recipient.ok) return { ok: false, reason: 'invalid-recipient' };

  const amountText = input.amount.trim();
  if (!/^\d+(?:\.\d+)?$/.test(amountText)) return { ok: false, reason: 'invalid-amount' };
  // parseUnits rounds excess precision. Reject it instead of silently changing intent.
  if ((amountText.split('.')[1]?.length ?? 0) > asset.decimals) return { ok: false, reason: 'invalid-amount' };
  try {
    const amount = parseUnits(amountText, asset.decimals);
    if (amount <= 0n) return { ok: false, reason: 'invalid-amount' };
    return { ok: true, intent: { chainId: 56, asset, recipient: recipient.address, amount } };
  } catch {
    return { ok: false, reason: 'invalid-amount' };
  }
}
