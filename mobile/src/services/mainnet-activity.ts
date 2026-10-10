import type { Address, Hash } from 'viem';

// Public Firebase HTTPS endpoint only. It accepts a public address and returns
// curated BNB and fixed-contract asset activity; no secret, wallet key, signing, or broadcast data
// is embedded in the mobile app.
export const MAINNET_ACTIVITY_FUNCTION_ORIGIN = 'https://asia-south1-aurionxi.cloudfunctions.net';
export const MAINNET_ACTIVITY_FUNCTION_PATH = '/walletMainnetActivity';
export const DEFAULT_MAINNET_ACTIVITY_API_URL = `${MAINNET_ACTIVITY_FUNCTION_ORIGIN}${MAINNET_ACTIVITY_FUNCTION_PATH}`;

export type MainnetActivityItem = {
  id: string;
  hash: Hash;
  blockNumber: string;
  timestamp: Date;
  direction: 'Received' | 'Sent' | 'Self';
  counterparty: Address;
  amount: string;
  symbol: 'BNB' | 'ARXI' | 'USDT' | 'USDC' | 'ETH' | 'BTCB';
  failed: boolean;
};

export type MainnetActivityResult = {
  items: MainnetActivityItem[];
  coverage: 'recent-curated-transfers';
  cached: boolean;
};

type MainnetActivityDto = Omit<MainnetActivityItem, 'timestamp'> & { timestamp: string };

export class MainnetActivityConfigurationError extends Error {
  constructor() { super('Mainnet activity service is not configured for this release.'); }
}

export function getMainnetActivityServiceBaseUrl(value = process.env.EXPO_PUBLIC_MAINNET_ACTIVITY_API_URL ?? DEFAULT_MAINNET_ACTIVITY_API_URL): string | undefined {
  const candidate = value?.trim().replace(/\/$/, '');
  if (!candidate) return undefined;
  try {
    const url = new URL(candidate);
    return url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash && candidate === DEFAULT_MAINNET_ACTIVITY_API_URL ? DEFAULT_MAINNET_ACTIVITY_API_URL : undefined;
  } catch { return undefined; }
}

function isItem(value: unknown): value is MainnetActivityDto {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<MainnetActivityDto>;
  return typeof item.id === 'string'
    && /^0x[a-fA-F0-9]{64}$/.test(item.hash ?? '')
    && /^\d+$/.test(item.blockNumber ?? '')
    && typeof item.timestamp === 'string' && !Number.isNaN(Date.parse(item.timestamp))
    && ['Received', 'Sent', 'Self'].includes(item.direction ?? '')
    && /^0x[a-fA-F0-9]{40}$/.test(item.counterparty ?? '')
    && typeof item.amount === 'string'
    && ['BNB', 'ARXI', 'USDT', 'USDC', 'ETH', 'BTCB'].includes(item.symbol ?? '')
    && typeof item.failed === 'boolean';
}

export function parseMainnetActivityResponse(payload: unknown): MainnetActivityResult {
  if (!payload || typeof payload !== 'object') throw new Error('Invalid Mainnet activity response.');
  const response = payload as Partial<{ items: MainnetActivityDto[]; coverage: string; cached: boolean }>;
  if (!Array.isArray(response.items) || !response.items.every(isItem) || response.coverage !== 'recent-curated-transfers' || typeof response.cached !== 'boolean') {
    throw new Error('Invalid Mainnet activity response.');
  }
  return { coverage: 'recent-curated-transfers', cached: response.cached, items: response.items.map((item) => ({ ...item, timestamp: new Date(item.timestamp) })) };
}

export async function fetchRecentMainnetActivity(address: Address): Promise<MainnetActivityResult> {
  const baseUrl = getMainnetActivityServiceBaseUrl();
  if (!baseUrl) throw new MainnetActivityConfigurationError();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(`${baseUrl}/v1/bsc-mainnet/activity?address=${encodeURIComponent(address)}`, { signal: controller.signal });
    if (!response.ok) throw new Error('Mainnet activity service is temporarily unavailable.');
    return parseMainnetActivityResponse(await response.json());
  } finally { clearTimeout(timeout); }
}
