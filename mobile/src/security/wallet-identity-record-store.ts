import * as SecureStore from 'expo-secure-store';

import {
  isWalletIdentityRecord,
  type WalletIdentityRecord,
} from './wallet-identity-record-core';
import { getNamespacedVaultStorageKey } from './vault-network-namespace';

const IDENTITY_KEY = 'aurionxi.wallet.authoritative-identity.v1';
const TESTNET_IDENTITY_KEY = getNamespacedVaultStorageKey('bsc-testnet', 'identity');
const MAINNET_IDENTITY_KEY = getNamespacedVaultStorageKey('bsc-mainnet', 'identity');
const options: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  keychainService: 'com.aurionxi.wallet.authoritative-identity',
  requireAuthentication: false,
};

const testnetOptions: SecureStore.SecureStoreOptions = {
  ...options,
  keychainService: 'com.aurionxi.wallet.bsc-testnet.v1.identity',
};

const mainnetOptions: SecureStore.SecureStoreOptions = {
  ...options,
  keychainService: 'com.aurionxi.wallet.bsc-mainnet.v1.identity',
};

function parseIdentity(stored: string | null): WalletIdentityRecord | null {
  if (stored === null) return null;
  try {
    const parsed: unknown = JSON.parse(stored);
    if (!isWalletIdentityRecord(parsed)) throw new Error('invalid');
    return parsed;
  } catch {
    throw new Error('The authoritative wallet identity record is invalid or corrupted.');
  }
}

export async function readWalletIdentityRecord(): Promise<WalletIdentityRecord | null> {
  if (!(await SecureStore.isAvailableAsync())) {
    throw new Error('Secure wallet identity storage is unavailable.');
  }
  const stored = await SecureStore.getItemAsync(TESTNET_IDENTITY_KEY, testnetOptions)
    ?? await SecureStore.getItemAsync(IDENTITY_KEY, options);
  return parseIdentity(stored);
}

export async function writeWalletIdentityRecord(record: WalletIdentityRecord): Promise<void> {
  if (!isWalletIdentityRecord(record)) throw new Error('The authoritative wallet identity record is invalid.');
  if (!(await SecureStore.isAvailableAsync())) {
    throw new Error('Secure wallet identity storage is unavailable.');
  }
  await SecureStore.setItemAsync(TESTNET_IDENTITY_KEY, JSON.stringify(record), testnetOptions);
}

export async function readLegacyWalletIdentityRecord(): Promise<WalletIdentityRecord | null> {
  if (!(await SecureStore.isAvailableAsync())) throw new Error('Secure wallet identity storage is unavailable.');
  return parseIdentity(await SecureStore.getItemAsync(IDENTITY_KEY, options));
}

export async function readTestnetWalletIdentityRecord(): Promise<WalletIdentityRecord | null> {
  if (!(await SecureStore.isAvailableAsync())) throw new Error('Secure wallet identity storage is unavailable.');
  return parseIdentity(await SecureStore.getItemAsync(TESTNET_IDENTITY_KEY, testnetOptions));
}

export async function writeTestnetWalletIdentityRecord(record: WalletIdentityRecord): Promise<void> {
  if (!isWalletIdentityRecord(record)) throw new Error('The authoritative wallet identity record is invalid.');
  if (!(await SecureStore.isAvailableAsync())) throw new Error('Secure wallet identity storage is unavailable.');
  await SecureStore.setItemAsync(TESTNET_IDENTITY_KEY, JSON.stringify(record), testnetOptions);
}

export async function readMainnetWalletIdentityRecord(): Promise<WalletIdentityRecord | null> {
  if (!(await SecureStore.isAvailableAsync())) throw new Error('Secure wallet identity storage is unavailable.');
  return parseIdentity(await SecureStore.getItemAsync(MAINNET_IDENTITY_KEY, mainnetOptions));
}

export async function writeMainnetWalletIdentityRecord(record: WalletIdentityRecord): Promise<void> {
  if (!isWalletIdentityRecord(record)) throw new Error('The authoritative wallet identity record is invalid.');
  if (!(await SecureStore.isAvailableAsync())) throw new Error('Secure wallet identity storage is unavailable.');
  await SecureStore.setItemAsync(MAINNET_IDENTITY_KEY, JSON.stringify(record), mainnetOptions);
}

/** Used only to roll back a newly-written Mainnet identity that failed verification. */
export async function deleteMainnetWalletIdentityRecord(): Promise<void> {
  if (!(await SecureStore.isAvailableAsync())) throw new Error('Secure wallet identity storage is unavailable.');
  await SecureStore.deleteItemAsync(MAINNET_IDENTITY_KEY, mainnetOptions);
}

export async function deleteWalletIdentityRecord(): Promise<void> {
  if (!(await SecureStore.isAvailableAsync())) {
    throw new Error('Secure wallet identity storage is unavailable.');
  }
  await SecureStore.deleteItemAsync(IDENTITY_KEY, options);
}
