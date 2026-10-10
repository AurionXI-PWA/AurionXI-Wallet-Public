import * as SecureStore from 'expo-secure-store';

import {
  isCanonicalVaultMigrationJournal,
  type CanonicalVaultMigrationJournal,
} from './canonical-vault-migration-journal-core';

const CANONICAL_MIGRATION_JOURNAL_KEY = 'aurionxi.wallet.canonical-vault-migration-journal.v1';
const options: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  keychainService: 'com.aurionxi.wallet.canonical-vault-migration-journal',
  requireAuthentication: false,
};

async function requireSecureStorage(): Promise<void> {
  if (!(await SecureStore.isAvailableAsync())) {
    throw new Error('Secure canonical vault migration storage is unavailable.');
  }
}

function journalsMatch(
  left: CanonicalVaultMigrationJournal,
  right: CanonicalVaultMigrationJournal,
): boolean {
  return left.format === right.format &&
    left.createdAt === right.createdAt &&
    left.phase === right.phase &&
    left.replacementTransactionId === right.replacementTransactionId &&
    left.candidatePublicAddress.toLowerCase() === right.candidatePublicAddress.toLowerCase() &&
    left.candidateCreatedAt === right.candidateCreatedAt;
}

export async function readCanonicalVaultMigrationJournal(): Promise<CanonicalVaultMigrationJournal | null> {
  await requireSecureStorage();
  const stored = await SecureStore.getItemAsync(CANONICAL_MIGRATION_JOURNAL_KEY, options);
  if (stored === null) return null;
  try {
    const parsed: unknown = JSON.parse(stored);
    if (!isCanonicalVaultMigrationJournal(parsed)) throw new Error('invalid');
    return parsed;
  } catch {
    throw new Error('The canonical vault migration journal is invalid or corrupted.');
  }
}

export async function writeCanonicalVaultMigrationJournal(
  journal: CanonicalVaultMigrationJournal,
): Promise<void> {
  if (!isCanonicalVaultMigrationJournal(journal)) {
    throw new Error('The canonical vault migration journal is invalid.');
  }
  await requireSecureStorage();
  await SecureStore.setItemAsync(
    CANONICAL_MIGRATION_JOURNAL_KEY,
    JSON.stringify(journal),
    options,
  );
}

export async function writeCanonicalVaultMigrationJournalVerified(
  journal: CanonicalVaultMigrationJournal,
): Promise<CanonicalVaultMigrationJournal> {
  await writeCanonicalVaultMigrationJournal(journal);
  const stored = await readCanonicalVaultMigrationJournal();
  if (!stored || !journalsMatch(journal, stored)) {
    throw new Error('Canonical vault migration journal failed read-back verification.');
  }
  return stored;
}
