import * as SecureStore from 'expo-secure-store';

import {
  isVaultActiveSlotRecord,
  type VaultActiveSlotRecord,
} from './vault-active-slot-core';

const ACTIVE_SLOT_KEY = 'aurionxi.wallet.active-slot.v1';
const options: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  keychainService: 'com.aurionxi.wallet.active-slot',
  requireAuthentication: false,
};

export async function readVaultActiveSlot(): Promise<VaultActiveSlotRecord | null> {
  if (!(await SecureStore.isAvailableAsync())) {
    throw new Error('Secure active-slot storage is unavailable.');
  }
  const stored = await SecureStore.getItemAsync(ACTIVE_SLOT_KEY, options);
  if (stored === null) return null;
  try {
    const parsed: unknown = JSON.parse(stored);
    if (!isVaultActiveSlotRecord(parsed)) throw new Error('invalid');
    return parsed;
  } catch {
    throw new Error('The vault active-slot record is invalid or corrupted.');
  }
}

export async function writeVaultActiveSlot(record: VaultActiveSlotRecord): Promise<void> {
  if (!isVaultActiveSlotRecord(record)) throw new Error('The vault active-slot record is invalid.');
  if (!(await SecureStore.isAvailableAsync())) {
    throw new Error('Secure active-slot storage is unavailable.');
  }
  await SecureStore.setItemAsync(ACTIVE_SLOT_KEY, JSON.stringify(record), options);
}
