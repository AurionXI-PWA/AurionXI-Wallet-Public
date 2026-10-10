import { keccak256 } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

import type { ValidatedTransactionIntent } from './transaction-intent-policy';
import type { PreparedSyntheticTestnetTransfer } from './synthetic-testnet-transfer-builder';

type SignatureFoundationInput = {
  debugBuild: boolean;
  walletSecretsEnabled: boolean;
  signingEnabled: boolean;
  intent: ValidatedTransactionIntent;
};

export type SyntheticTestnetSignature = {
  address: `0x${string}`;
  message: string;
  signature: `0x${string}`;
};

export function getSyntheticTestnetPreparedPayloadReviewMessage(
  payload: PreparedSyntheticTestnetTransfer,
): string {
  if (payload.chainId !== 97 || payload.value !== 0n) {
    throw new Error('Prepared payload is not an approved BSC Testnet token transfer.');
  }
  return [
    'AurionXI Wallet V1.0 — Synthetic Testnet Payload Integrity Review',
    `Chain ID: ${payload.chainId}`,
    `Contract: ${payload.to}`,
    `Native value: ${payload.value.toString()}`,
    `Calldata hash: ${keccak256(payload.data)}`,
    'Scope: local payload integrity signature only; no transaction authorization.',
  ].join('\n');
}

function requireSyntheticTestnetSignaturePrerequisites(input: SignatureFoundationInput): void {
  if (!input.debugBuild) throw new Error('Synthetic signatures are limited to debug builds.');
  if (!input.walletSecretsEnabled) throw new Error('Synthetic wallet-secret handling is disabled.');
  if (!input.signingEnabled) throw new Error('Synthetic signing is disabled.');
  if (input.intent.chainId !== 97) throw new Error('Synthetic signatures are limited to BSC Testnet.');
}

function getReviewMessage(intent: ValidatedTransactionIntent): string {
  return [
    'AurionXI Wallet V1.0 — Synthetic Testnet Review',
    'Chain ID: 97',
    `Asset: ${intent.asset.symbol}`,
    `Amount (base units): ${intent.amount.toString()}`,
    `Recipient: ${intent.recipient}`,
    'Scope: local signature only; no transaction authorization.',
  ].join('\n');
}

/**
 * Creates an ephemeral local-only signature for a synthetic Testnet review message.
 * The generated account is never stored, returned, sent to an RPC, or used to broadcast.
 */
export async function createSyntheticTestnetReviewSignature(
  input: SignatureFoundationInput,
): Promise<SyntheticTestnetSignature> {
  requireSyntheticTestnetSignaturePrerequisites(input);
  const account = privateKeyToAccount(generatePrivateKey());
  const message = getReviewMessage(input.intent);
  const signature = await account.signMessage({ message });
  return { address: account.address, message, signature };
}

/** Signs a canonical digest representation of an already prepared synthetic payload locally only. */
export async function createSyntheticTestnetPreparedPayloadSignature(input: {
  debugBuild: boolean;
  walletSecretsEnabled: boolean;
  signingEnabled: boolean;
  payload: PreparedSyntheticTestnetTransfer;
}): Promise<SyntheticTestnetSignature> {
  if (!input.debugBuild) throw new Error('Synthetic signatures are limited to debug builds.');
  if (!input.walletSecretsEnabled) throw new Error('Synthetic wallet-secret handling is disabled.');
  if (!input.signingEnabled) throw new Error('Synthetic signing is disabled.');
  const account = privateKeyToAccount(generatePrivateKey());
  const message = getSyntheticTestnetPreparedPayloadReviewMessage(input.payload);
  const signature = await account.signMessage({ message });
  return { address: account.address, message, signature };
}
