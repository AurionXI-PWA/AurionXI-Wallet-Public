import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Address, Hash } from 'viem';

import type { ActivityItem } from '@/services/activity';

const JOURNAL_PREFIX = '@aurionxi/wallet-v1/public-native-activity/v1';
const MAX_PUBLIC_NATIVE_ITEMS = 5;

type StoredItem = Omit<ActivityItem, 'timestamp'> & { timestamp: string };

function journalKey(address: Address): string {
  return `${JOURNAL_PREFIX}/${address.toLowerCase()}`;
}

function isStoredItem(value: unknown): value is StoredItem {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<StoredItem>;
  return item.symbol === 'tBNB'
    && item.direction === 'Sent'
    && typeof item.id === 'string'
    && typeof item.hash === 'string'
    && typeof item.blockNumber === 'string'
    && typeof item.timestamp === 'string'
    && typeof item.counterparty === 'string'
    && typeof item.amount === 'string'
    && item.failed === false;
}

export async function loadPublicNativeActivityJournal(address: Address): Promise<ActivityItem[]> {
  const raw = await AsyncStorage.getItem(journalKey(address));
  if (!raw) return [];
  try {
    const stored = JSON.parse(raw) as unknown;
    if (!Array.isArray(stored)) return [];
    return stored
      .filter(isStoredItem)
      .map((item) => ({ ...item, timestamp: new Date(item.timestamp) }))
      .filter((item) => !Number.isNaN(item.timestamp.getTime()))
      .slice(0, MAX_PUBLIC_NATIVE_ITEMS);
  } catch {
    return [];
  }
}

export async function recordPublicNativeSend(input: {
  address: Address;
  amount: string;
  blockNumber: string;
  hash: Hash;
  recipient: Address;
  timestamp: Date;
}): Promise<void> {
  const existing = await loadPublicNativeActivityJournal(input.address);
  const next: ActivityItem = {
    id: `native-local:${input.hash}`,
    hash: input.hash,
    blockNumber: input.blockNumber,
    timestamp: input.timestamp,
    direction: 'Sent',
    counterparty: input.recipient,
    amount: input.amount,
    symbol: 'tBNB',
    failed: false,
  };
  const deduplicated = [next, ...existing.filter((item) => item.hash !== next.hash)]
    .sort((left, right) => right.timestamp.getTime() - left.timestamp.getTime())
    .slice(0, MAX_PUBLIC_NATIVE_ITEMS)
    .map((item) => ({ ...item, timestamp: item.timestamp.toISOString() }));
  await AsyncStorage.setItem(journalKey(input.address), JSON.stringify(deduplicated));
}
