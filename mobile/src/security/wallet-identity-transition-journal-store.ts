import * as SecureStore from 'expo-secure-store';

import {
  isWalletIdentityTransitionJournal,
  type WalletIdentityTransitionJournal,
} from './wallet-identity-transition-journal-core';

const IDENTITY_TRANSITION_JOURNAL_KEY = 'aurionxi.wallet.identity-transition-journal.v1';
const options: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  keychainService: 'com.aurionxi.wallet.identity-transition-journal',
  requireAuthentication: false,
};

async function requireSecureStorage(): Promise<void> {
  if (!(await SecureStore.isAvailableAsync())) {
    throw new Error('Secure wallet identity transition storage is unavailable.');
  }
}

function identitiesMatch(
  left: WalletIdentityTransitionJournal['previousIdentity'],
  right: WalletIdentityTransitionJournal['previousIdentity'],
): boolean {
  return left.format === right.format &&
    left.derivationPath === right.derivationPath &&
    left.publicAddress.toLowerCase() === right.publicAddress.toLowerCase() &&
    left.vaultCreatedAt === right.vaultCreatedAt;
}

function journalsMatch(
  left: WalletIdentityTransitionJournal,
  right: WalletIdentityTransitionJournal,
): boolean {
  return left.format === right.format &&
    left.createdAt === right.createdAt &&
    left.phase === right.phase &&
    left.replacementTransactionId === right.replacementTransactionId &&
    identitiesMatch(left.previousIdentity, right.previousIdentity) &&
    identitiesMatch(left.nextIdentity, right.nextIdentity);
}

export async function readWalletIdentityTransitionJournal(): Promise<WalletIdentityTransitionJournal | null> {
  await requireSecureStorage();
  const stored = await SecureStore.getItemAsync(IDENTITY_TRANSITION_JOURNAL_KEY, options);
  if (stored === null) return null;
  try {
    const parsed: unknown = JSON.parse(stored);
    if (!isWalletIdentityTransitionJournal(parsed)) throw new Error('invalid');
    return parsed;
  } catch {
    throw new Error('The wallet identity transition journal is invalid or corrupted.');
  }
}

export async function writeWalletIdentityTransitionJournal(
  journal: WalletIdentityTransitionJournal,
): Promise<void> {
  if (!isWalletIdentityTransitionJournal(journal)) {
    throw new Error('The wallet identity transition journal is invalid.');
  }
  await requireSecureStorage();
  await SecureStore.setItemAsync(
    IDENTITY_TRANSITION_JOURNAL_KEY,
    JSON.stringify(journal),
    options,
  );
}

export async function writeWalletIdentityTransitionJournalVerified(
  journal: WalletIdentityTransitionJournal,
): Promise<WalletIdentityTransitionJournal> {
  await writeWalletIdentityTransitionJournal(journal);
  const stored = await readWalletIdentityTransitionJournal();
  if (!stored || !journalsMatch(journal, stored)) {
    throw new Error('Wallet identity transition journal failed read-back verification.');
  }
  return stored;
}
