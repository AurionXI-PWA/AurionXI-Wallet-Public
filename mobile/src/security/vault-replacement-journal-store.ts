import * as SecureStore from 'expo-secure-store';

import {
  isVaultReplacementJournal,
  type VaultReplacementJournal,
} from './vault-replacement-journal-core';

const JOURNAL_KEY = 'aurionxi.wallet.vault.replacement-journal.v1';
const JOURNAL_SERVICE = 'com.aurionxi.wallet.vault-replacement-journal';
const options: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  keychainService: JOURNAL_SERVICE,
  requireAuthentication: false,
};

export async function readVaultReplacementJournal(): Promise<VaultReplacementJournal | null> {
  const stored = await SecureStore.getItemAsync(JOURNAL_KEY, options);
  if (stored === null) return null;
  try {
    const parsed: unknown = JSON.parse(stored);
    if (!isVaultReplacementJournal(parsed)) throw new Error('invalid');
    return parsed;
  } catch {
    throw new Error('The vault replacement journal is invalid or corrupted.');
  }
}

export async function writeVaultReplacementJournal(journal: VaultReplacementJournal): Promise<void> {
  if (!isVaultReplacementJournal(journal)) throw new Error('The vault replacement journal is invalid.');
  await SecureStore.setItemAsync(JOURNAL_KEY, JSON.stringify(journal), options);
}

export async function deleteVaultReplacementJournal(): Promise<void> {
  await SecureStore.deleteItemAsync(JOURNAL_KEY, options);
}
