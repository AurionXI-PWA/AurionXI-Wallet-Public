import { keccak256, type Hash, type Hex } from 'viem';

import { appCheckRequestHeaders, getFirebaseAppCheckToken } from './firebase-app-check';

import type { TestnetRpcBroadcasterClient } from './testnet-rpc-broadcaster';

const BSC_TESTNET_CHAIN_ID = 97;

type BroadcastResponse = {
  accepted: boolean;
  chainId: number;
  hash: string;
};

export class TestnetBroadcastConfigurationError extends Error {
  constructor() {
    super('Testnet broadcast requires the approved AurionXI relay URL.');
    this.name = 'TestnetBroadcastConfigurationError';
  }
}

export class TestnetBroadcastRelayError extends Error {
  constructor() {
    super('The Testnet broadcast relay did not accept this transaction.');
    this.name = 'TestnetBroadcastRelayError';
  }
}

/**
 * This public Function URL is not an RPC credential. Its exact endpoint is
 * deliberately separate from the activity service so the broadcaster cannot
 * become enabled by a history-only configuration change.
 */
export function getTestnetBroadcastServiceUrl(
  value = process.env.EXPO_PUBLIC_TESTNET_BROADCAST_API_URL,
): string | undefined {
  const candidate = value?.trim().replace(/\/$/, '');
  if (!candidate) return undefined;

  try {
    const url = new URL(candidate);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) return undefined;
    return candidate;
  } catch {
    return undefined;
  }
}

function isAcceptedResponse(value: unknown, expectedHash: Hash): value is BroadcastResponse {
  if (!value || typeof value !== 'object') return false;
  const response = value as Partial<BroadcastResponse>;
  return response.accepted === true
    && response.chainId === BSC_TESTNET_CHAIN_ID
    && typeof response.hash === 'string'
    && response.hash.toLowerCase() === expectedHash.toLowerCase();
}

/**
 * Relays only an already signed, in-memory Testnet transaction. It never
 * receives a PIN, recovery phrase, private key, or RPC credential.
 */
export async function broadcastViaTestnetRelay(serializedTransaction: Hex): Promise<Hash> {
  const serviceUrl = getTestnetBroadcastServiceUrl();
  if (!serviceUrl) throw new TestnetBroadcastConfigurationError();

  const expectedHash = keccak256(serializedTransaction);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const appCheckToken = await getFirebaseAppCheckToken();
    const response = await fetch(serviceUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...appCheckRequestHeaders(appCheckToken) },
      body: JSON.stringify({ serializedTransaction, expectedHash }),
      signal: controller.signal,
    });
    if (!response.ok || !isAcceptedResponse(await response.json(), expectedHash)) {
      throw new TestnetBroadcastRelayError();
    }
    return expectedHash;
  } catch (error) {
    if (error instanceof TestnetBroadcastConfigurationError || error instanceof TestnetBroadcastRelayError) throw error;
    throw new TestnetBroadcastRelayError();
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Compatibility adapter for the existing explicit-approval coordinator. The
 * coordinator still controls whether this callback may ever be invoked.
 */
export function createTestnetRelayBroadcaster(): TestnetRpcBroadcasterClient {
  return {
    sendRawTransaction: ({ serializedTransaction }) => broadcastViaTestnetRelay(serializedTransaction),
  };
}
