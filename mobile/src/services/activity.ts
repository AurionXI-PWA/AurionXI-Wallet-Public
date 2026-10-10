import type { Address, Hash } from 'viem';

export type ActivityDirection = 'Received' | 'Sent' | 'Self';

export type ActivityItem = {
  id: string;
  hash: Hash;
  blockNumber: string;
  timestamp: Date;
  direction: ActivityDirection;
  counterparty: Address;
  amount: string;
  /** Only curated BSC Testnet assets may be returned by the history proxy. */
  symbol: 'tBNB' | 'ARXI' | 'USDT';
  failed: boolean;
};

/** The proxy must disclose exactly which public history it queried. */
export type ActivityCoverage = 'full' | 'arxi-only' | 'curated-assets' | 'recent-curated-token-transfers';

export type ActivityResult = {
  items: ActivityItem[];
  coverage: ActivityCoverage;
  cached: boolean;
};

/** Combines independently verified public sources without duplicating a transaction hash. */
export function mergeRecentActivity(...groups: ActivityItem[][]): ActivityItem[] {
  const unique = new Map<Hash, ActivityItem>();
  for (const item of groups.flat()) {
    const current = unique.get(item.hash);
    if (!current || current.timestamp.getTime() < item.timestamp.getTime()) unique.set(item.hash, item);
  }
  return [...unique.values()].sort((left, right) => right.timestamp.getTime() - left.timestamp.getTime());
}

type ActivityDto = Omit<ActivityItem, 'timestamp'> & {
  timestamp: string;
};

type ActivityResponse = {
  items: ActivityDto[];
  coverage: ActivityCoverage;
  cached: boolean;
};

export class ActivityConfigurationError extends Error {
  constructor() {
    super('Transaction history requires a configured AurionXI data service.');
    this.name = 'ActivityConfigurationError';
  }
}

/** Public-history provider policy. Credentials and private wallet material never belong in this URL. */
export function getActivityServiceBaseUrl(value = process.env.EXPO_PUBLIC_ACTIVITY_API_URL): string | undefined {
  const candidate = value?.trim().replace(/\/$/, '');
  if (!candidate) return undefined;

  try {
    const url = new URL(candidate);
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      return undefined;
    }
    return candidate;
  } catch {
    return undefined;
  }
}

function isActivityDto(value: unknown): value is ActivityDto {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<ActivityDto>;
  return (
    typeof item.id === 'string' &&
    typeof item.hash === 'string' &&
    typeof item.blockNumber === 'string' &&
    typeof item.timestamp === 'string' &&
    ['Received', 'Sent', 'Self'].includes(item.direction || '') &&
    typeof item.counterparty === 'string' &&
    typeof item.amount === 'string' &&
    ['tBNB', 'ARXI', 'USDT'].includes(item.symbol || '') &&
    typeof item.failed === 'boolean'
  );
}

export function parseActivityResponse(payload: unknown): ActivityResult {
  if (!payload || typeof payload !== 'object') throw new Error('Invalid history response.');
  const response = payload as Partial<ActivityResponse>;
  if (
    !Array.isArray(response.items) ||
    !response.items.every(isActivityDto) ||
    !['full', 'arxi-only', 'curated-assets', 'recent-curated-token-transfers'].includes(response.coverage || '') ||
    typeof response.cached !== 'boolean'
  ) {
    throw new Error('Invalid history response.');
  }

  return {
    coverage: response.coverage as ActivityCoverage,
    cached: response.cached,
    items: response.items.map((item) => ({
      ...item,
      timestamp: new Date(item.timestamp),
    })),
  };
}

export async function fetchRecentActivity(address: Address): Promise<ActivityResult> {
  const baseUrl = getActivityServiceBaseUrl();
  if (!baseUrl) throw new ActivityConfigurationError();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(
      `${baseUrl}/v1/bsc-testnet/activity?address=${encodeURIComponent(address)}`,
      { signal: controller.signal },
    );
    if (response.status === 503) throw new Error('History service is temporarily unavailable.');
    if (!response.ok) throw new Error(`History service failed with ${response.status}.`);
    return parseActivityResponse(await response.json());
  } finally {
    clearTimeout(timeout);
  }
}
