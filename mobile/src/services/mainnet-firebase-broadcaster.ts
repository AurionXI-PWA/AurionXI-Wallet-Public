import type { Hash, Hex } from 'viem';

import type { MainnetReviewEnvelope } from '@/security/mainnet-review-envelope';
import { appCheckRequestHeaders, getFirebaseAppCheckToken } from './firebase-app-check';

type MainnetBroadcastResponse = Readonly<{ accepted: true; chainId: 56; hash: Hash }>;

export class MainnetBroadcastConfigurationError extends Error {
  constructor() { super('Mainnet broadcast requires the approved AurionXI relay URL.'); this.name = 'MainnetBroadcastConfigurationError'; }
}

export class MainnetAppCheckUnavailableError extends Error {
  constructor() { super('Mainnet broadcast requires a fresh Firebase App Check token.'); this.name = 'MainnetAppCheckUnavailableError'; }
}

export class MainnetBroadcastRelayError extends Error {
  constructor() { super('The Mainnet relay did not accept this transaction.'); this.name = 'MainnetBroadcastRelayError'; }
}

export function getMainnetBroadcastServiceUrl(value = process.env.EXPO_PUBLIC_MAINNET_BROADCAST_API_URL): string | undefined {
  const candidate = value?.trim().replace(/\/$/, '');
  if (!candidate) return undefined;
  try {
    const url = new URL(candidate);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) return undefined;
    return candidate;
  } catch { return undefined; }
}

function accepted(value: unknown, expectedHash: Hash): value is MainnetBroadcastResponse {
  if (!value || typeof value !== 'object') return false;
  const response = value as Partial<MainnetBroadcastResponse>;
  return response.accepted === true && response.chainId === 56
    && typeof response.hash === 'string' && response.hash.toLowerCase() === expectedHash.toLowerCase();
}

/** Sends only already-signed public transaction data to the fixed Firebase relay. */
export async function broadcastViaMainnetRelay(input: {
  rawTransaction: Hex;
  expectedHash: Hash;
  review: MainnetReviewEnvelope;
}): Promise<Hash> {
  const serviceUrl = getMainnetBroadcastServiceUrl();
  if (!serviceUrl) throw new MainnetBroadcastConfigurationError();
  const appCheckToken = await getFirebaseAppCheckToken();
  if (!appCheckToken) throw new MainnetAppCheckUnavailableError();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(serviceUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...appCheckRequestHeaders(appCheckToken) },
      body: JSON.stringify({
        serializedTransaction: input.rawTransaction,
        expectedHash: input.expectedHash,
        senderAddress: input.review.senderAddress,
        recipientAddress: input.review.recipient,
        asset: input.review.assetId,
        amountWei: input.review.amount.toString(),
        nonce: input.review.nonce.toString(),
        gasLimit: input.review.gas.toString(),
        gasPriceWei: input.review.gasPrice.toString(),
      }),
      signal: controller.signal,
    });
    if (!response.ok || !accepted(await response.json(), input.expectedHash)) throw new MainnetBroadcastRelayError();
    return input.expectedHash;
  } catch (error) {
    if (error instanceof MainnetBroadcastRelayError) throw error;
    throw new MainnetBroadcastRelayError();
  } finally { clearTimeout(timeout); }
}

