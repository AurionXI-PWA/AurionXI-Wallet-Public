import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Address } from 'viem';

import type { MainnetActivityResult } from '@/services/mainnet-activity';

const PREFIX = '@aurionxi/wallet-v1/public-mainnet-activity/v1';
type Stored = Omit<MainnetActivityResult, 'items'> & { items: (Omit<MainnetActivityResult['items'][number], 'timestamp'> & { timestamp: string })[] };
const key = (address: Address) => `${PREFIX}/${address.toLowerCase()}`;

export async function loadMainnetPublicActivityCache(address: Address): Promise<MainnetActivityResult | undefined> {
  const raw = await AsyncStorage.getItem(key(address));
  if (!raw) return undefined;
  try {
    const stored = JSON.parse(raw) as Stored;
    if (!Array.isArray(stored.items) || stored.coverage !== 'recent-curated-transfers' || typeof stored.cached !== 'boolean') return undefined;
    const items = stored.items.map((item) => ({ ...item, timestamp: new Date(item.timestamp) }));
    return items.some((item) => Number.isNaN(item.timestamp.getTime())) ? undefined : { ...stored, items };
  } catch { return undefined; }
}

export async function saveMainnetPublicActivityCache(address: Address, result: MainnetActivityResult): Promise<void> {
  const stored: Stored = { ...result, items: result.items.map((item) => ({ ...item, timestamp: item.timestamp.toISOString() })) };
  await AsyncStorage.setItem(key(address), JSON.stringify(stored));
}
