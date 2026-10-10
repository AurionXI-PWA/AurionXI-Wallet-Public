import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Address } from 'viem';

import type { ActivityResult } from '@/services/activity';

const CACHE_PREFIX = '@aurionxi/wallet-v1/public-testnet-activity/v1';

type StoredActivityResult = Omit<ActivityResult, 'items'> & {
  items: (Omit<ActivityResult['items'][number], 'timestamp'> & { timestamp: string })[];
};

function cacheKey(address: Address): string {
  return `${CACHE_PREFIX}/${address.toLowerCase()}`;
}

export async function loadPublicActivityCache(address: Address): Promise<ActivityResult | undefined> {
  const raw = await AsyncStorage.getItem(cacheKey(address));
  if (!raw) return undefined;

  try {
    const stored = JSON.parse(raw) as StoredActivityResult;
    if (!Array.isArray(stored.items) || typeof stored.coverage !== 'string' || typeof stored.cached !== 'boolean') {
      return undefined;
    }

    const items = stored.items.map((item) => ({ ...item, timestamp: new Date(item.timestamp) }));
    if (items.some((item) => Number.isNaN(item.timestamp.getTime()))) return undefined;
    return { ...stored, items };
  } catch {
    return undefined;
  }
}

export async function savePublicActivityCache(address: Address, result: ActivityResult): Promise<void> {
  const stored: StoredActivityResult = {
    ...result,
    items: result.items.map((item) => ({ ...item, timestamp: item.timestamp.toISOString() })),
  };
  await AsyncStorage.setItem(cacheKey(address), JSON.stringify(stored));
}
