import * as SecureStore from 'expo-secure-store';

import {
  isRetiredPrimaryCleanupJournal,
  type RetiredPrimaryCleanupJournal,
} from './retired-primary-cleanup-journal-core';

const RETIRED_PRIMARY_CLEANUP_JOURNAL_KEY = 'aurionxi.wallet.retired-primary-cleanup-journal.v1';
const options: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  keychainService: 'com.aurionxi.wallet.retired-primary-cleanup-journal',
  requireAuthentication: false,
};

async function requireSecureStorage(): Promise<void> {
  if (!(await SecureStore.isAvailableAsync())) {
    throw new Error('Secure retired primary cleanup storage is unavailable.');
  }
}

function identitiesMatch(
  left: RetiredPrimaryCleanupJournal['activeIdentity'],
  right: RetiredPrimaryCleanupJournal['activeIdentity'],
): boolean {
  return left.format === right.format &&
    left.derivationPath === right.derivationPath &&
    left.publicAddress.toLowerCase() === right.publicAddress.toLowerCase() &&
    left.vaultCreatedAt === right.vaultCreatedAt;
}

function journalsMatch(
  left: RetiredPrimaryCleanupJournal,
  right: RetiredPrimaryCleanupJournal,
): boolean {
  return left.format === right.format &&
    left.createdAt === right.createdAt &&
    left.phase === right.phase &&
    left.replacementTransactionId === right.replacementTransactionId &&
    left.retiredPrimaryStatus === right.retiredPrimaryStatus &&
    identitiesMatch(left.retiredIdentity, right.retiredIdentity) &&
    identitiesMatch(left.activeIdentity, right.activeIdentity);
}

export async function readRetiredPrimaryCleanupJournal(): Promise<RetiredPrimaryCleanupJournal | null> {
  await requireSecureStorage();
  const stored = await SecureStore.getItemAsync(RETIRED_PRIMARY_CLEANUP_JOURNAL_KEY, options);
  if (stored === null) return null;
  try {
    const parsed: unknown = JSON.parse(stored);
    if (!isRetiredPrimaryCleanupJournal(parsed)) throw new Error('invalid');
    return parsed;
  } catch {
    throw new Error('The retired primary cleanup journal is invalid or corrupted.');
  }
}

export async function writeRetiredPrimaryCleanupJournal(
  journal: RetiredPrimaryCleanupJournal,
): Promise<void> {
  if (!isRetiredPrimaryCleanupJournal(journal)) {
    throw new Error('The retired primary cleanup journal is invalid.');
  }
  await requireSecureStorage();
  await SecureStore.setItemAsync(
    RETIRED_PRIMARY_CLEANUP_JOURNAL_KEY,
    JSON.stringify(journal),
    options,
  );
}

export async function writeRetiredPrimaryCleanupJournalVerified(
  journal: RetiredPrimaryCleanupJournal,
): Promise<RetiredPrimaryCleanupJournal> {
  await writeRetiredPrimaryCleanupJournal(journal);
  const stored = await readRetiredPrimaryCleanupJournal();
  if (!stored || !journalsMatch(journal, stored)) {
    throw new Error('Retired primary cleanup journal failed read-back verification.');
  }
  return stored;
}
