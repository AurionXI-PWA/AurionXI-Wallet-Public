import * as SecureStore from 'expo-secure-store';

import { isVaultV3Envelope, type VaultV3Envelope } from './vault-envelope-v3';
import { getNamespacedVaultStorageKey } from './vault-network-namespace';

const VAULT_KEY = 'aurionxi.wallet.vault.v2';
const VAULT_V3_KEY = 'aurionxi.wallet.vault.v3';
const VAULT_V3_CANDIDATE_KEY = 'aurionxi.wallet.vault.v3.candidate.v1';
const TESTNET_VAULT_V3_KEY = getNamespacedVaultStorageKey('bsc-testnet', 'vault');
const MAINNET_VAULT_V3_KEY = getNamespacedVaultStorageKey('bsc-mainnet', 'vault');
const VAULT_SERVICE = 'com.aurionxi.wallet.vault';
const TESTNET_VAULT_SERVICE = 'com.aurionxi.wallet.bsc-testnet.v1.vault';
const MAINNET_VAULT_SERVICE = 'com.aurionxi.wallet.bsc-mainnet.v1.vault';
const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;

const VAULT_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  keychainService: VAULT_SERVICE,
  requireAuthentication: false,
};

const TESTNET_VAULT_OPTIONS: SecureStore.SecureStoreOptions = {
  ...VAULT_OPTIONS,
  keychainService: TESTNET_VAULT_SERVICE,
};

const MAINNET_VAULT_OPTIONS: SecureStore.SecureStoreOptions = {
  ...VAULT_OPTIONS,
  keychainService: MAINNET_VAULT_SERVICE,
};

export type EncryptedVaultEnvelope = {
  format: 'aurionxi-vault-v2';
  publicAddress: `0x${string}`;
  ciphertext: string;
  createdAt: string;
  kdf: {
    algorithm: 'argon2id';
    saltHex: string;
  };
};

export type VaultStatus = 'unsupported' | 'empty' | 'present' | 'corrupt';

export class VaultStorageUnavailableError extends Error {
  constructor() {
    super('Secure device storage is unavailable.');
    this.name = 'VaultStorageUnavailableError';
  }
}

export class VaultCorruptedError extends Error {
  constructor() {
    super('The encrypted wallet vault is invalid or corrupted.');
    this.name = 'VaultCorruptedError';
  }
}

function isEnvelope(value: unknown): value is EncryptedVaultEnvelope {
  if (!value || typeof value !== 'object') return false;
  const envelope = value as Partial<EncryptedVaultEnvelope>;
  return (
    envelope.format === 'aurionxi-vault-v2' &&
    typeof envelope.publicAddress === 'string' &&
    /^0x[a-fA-F0-9]{40}$/.test(envelope.publicAddress) &&
    typeof envelope.ciphertext === 'string' &&
    envelope.ciphertext.length >= 32 &&
    BASE64_PATTERN.test(envelope.ciphertext) &&
    typeof envelope.createdAt === 'string' &&
    !Number.isNaN(Date.parse(envelope.createdAt)) &&
    !!envelope.kdf &&
    envelope.kdf.algorithm === 'argon2id' &&
    typeof envelope.kdf.saltHex === 'string' &&
    /^[a-f0-9]{32}$/.test(envelope.kdf.saltHex)
  );
}

async function requireSecureStorage() {
  if (!(await SecureStore.isAvailableAsync())) {
    throw new VaultStorageUnavailableError();
  }
}

export async function getVaultV3Status(): Promise<VaultStatus> {
  if (!(await SecureStore.isAvailableAsync())) return 'unsupported';
  const storedV3 = await SecureStore.getItemAsync(TESTNET_VAULT_V3_KEY, TESTNET_VAULT_OPTIONS)
    ?? await SecureStore.getItemAsync(VAULT_V3_KEY, VAULT_OPTIONS);
  if (storedV3 !== null) {
    try {
      return isVaultV3Envelope(JSON.parse(storedV3)) ? 'present' : 'corrupt';
    } catch {
      return 'corrupt';
    }
  }
  return 'empty';
}

/** Reads only the independent Mainnet namespace status; it never falls back to another network. */
export async function getMainnetVaultV3Status(): Promise<VaultStatus> {
  if (!(await SecureStore.isAvailableAsync())) return 'unsupported';
  const stored = await SecureStore.getItemAsync(MAINNET_VAULT_V3_KEY, MAINNET_VAULT_OPTIONS);
  if (stored === null) return 'empty';
  try {
    return isVaultV3Envelope(JSON.parse(stored)) ? 'present' : 'corrupt';
  } catch {
    return 'corrupt';
  }
}

export async function getVaultStatus(): Promise<VaultStatus> {
  const v3Status = await getVaultV3Status();
  if (v3Status !== 'empty') return v3Status;
  const stored = await SecureStore.getItemAsync(VAULT_KEY, VAULT_OPTIONS);
  if (stored === null) return 'empty';

  try {
    return isEnvelope(JSON.parse(stored)) ? 'present' : 'corrupt';
  } catch {
    return 'corrupt';
  }
}

export async function readEncryptedVault(): Promise<EncryptedVaultEnvelope | null> {
  await requireSecureStorage();
  const stored = await SecureStore.getItemAsync(VAULT_KEY, VAULT_OPTIONS);
  if (stored === null) return null;

  try {
    const envelope: unknown = JSON.parse(stored);
    if (!isEnvelope(envelope)) throw new VaultCorruptedError();
    return envelope;
  } catch (error) {
    if (error instanceof VaultCorruptedError) throw error;
    throw new VaultCorruptedError();
  }
}

export async function writeEncryptedVault(envelope: EncryptedVaultEnvelope): Promise<void> {
  await requireSecureStorage();
  if (!isEnvelope(envelope)) throw new VaultCorruptedError();
  await SecureStore.setItemAsync(VAULT_KEY, JSON.stringify(envelope), VAULT_OPTIONS);
}

export async function deleteEncryptedVault(): Promise<void> {
  await requireSecureStorage();
  await SecureStore.deleteItemAsync(VAULT_KEY, VAULT_OPTIONS);
}

export async function readVaultV3(): Promise<VaultV3Envelope | null> {
  await requireSecureStorage();
  const stored = await SecureStore.getItemAsync(TESTNET_VAULT_V3_KEY, TESTNET_VAULT_OPTIONS)
    ?? await SecureStore.getItemAsync(VAULT_V3_KEY, VAULT_OPTIONS);
  if (stored === null) return null;
  try {
    const envelope: unknown = JSON.parse(stored);
    if (!isVaultV3Envelope(envelope)) throw new VaultCorruptedError();
    return envelope;
  } catch (error) {
    if (error instanceof VaultCorruptedError) throw error;
    throw new VaultCorruptedError();
  }
}

export async function writeVaultV3(envelope: VaultV3Envelope): Promise<void> {
  await requireSecureStorage();
  if (!isVaultV3Envelope(envelope)) throw new VaultCorruptedError();
  await SecureStore.setItemAsync(TESTNET_VAULT_V3_KEY, JSON.stringify(envelope), TESTNET_VAULT_OPTIONS);
}

export async function readLegacyVaultV3(): Promise<VaultV3Envelope | null> {
  await requireSecureStorage();
  const stored = await SecureStore.getItemAsync(VAULT_V3_KEY, VAULT_OPTIONS);
  if (stored === null) return null;
  try {
    const envelope: unknown = JSON.parse(stored);
    if (!isVaultV3Envelope(envelope)) throw new VaultCorruptedError();
    return envelope;
  } catch (error) {
    if (error instanceof VaultCorruptedError) throw error;
    throw new VaultCorruptedError();
  }
}

export async function readTestnetVaultV3(): Promise<VaultV3Envelope | null> {
  await requireSecureStorage();
  const stored = await SecureStore.getItemAsync(TESTNET_VAULT_V3_KEY, TESTNET_VAULT_OPTIONS);
  if (stored === null) return null;
  try {
    const envelope: unknown = JSON.parse(stored);
    if (!isVaultV3Envelope(envelope)) throw new VaultCorruptedError();
    return envelope;
  } catch (error) {
    if (error instanceof VaultCorruptedError) throw error;
    throw new VaultCorruptedError();
  }
}

export async function writeTestnetVaultV3(envelope: VaultV3Envelope): Promise<void> {
  await requireSecureStorage();
  if (!isVaultV3Envelope(envelope)) throw new VaultCorruptedError();
  await SecureStore.setItemAsync(TESTNET_VAULT_V3_KEY, JSON.stringify(envelope), TESTNET_VAULT_OPTIONS);
}

export async function readMainnetVaultV3(): Promise<VaultV3Envelope | null> {
  await requireSecureStorage();
  const stored = await SecureStore.getItemAsync(MAINNET_VAULT_V3_KEY, MAINNET_VAULT_OPTIONS);
  if (stored === null) return null;
  try {
    const envelope: unknown = JSON.parse(stored);
    if (!isVaultV3Envelope(envelope)) throw new VaultCorruptedError();
    return envelope;
  } catch (error) {
    if (error instanceof VaultCorruptedError) throw error;
    throw new VaultCorruptedError();
  }
}

export async function writeMainnetVaultV3(envelope: VaultV3Envelope): Promise<void> {
  await requireSecureStorage();
  if (!isVaultV3Envelope(envelope)) throw new VaultCorruptedError();
  await SecureStore.setItemAsync(MAINNET_VAULT_V3_KEY, JSON.stringify(envelope), MAINNET_VAULT_OPTIONS);
}

/** Used only to roll back a newly-created, unverified Mainnet vault record. */
export async function deleteMainnetVaultV3(): Promise<void> {
  await requireSecureStorage();
  await SecureStore.deleteItemAsync(MAINNET_VAULT_V3_KEY, MAINNET_VAULT_OPTIONS);
}

export async function deleteVaultV3(): Promise<void> {
  await requireSecureStorage();
  await SecureStore.deleteItemAsync(VAULT_V3_KEY, VAULT_OPTIONS);
}

export async function readVaultV3Candidate(): Promise<VaultV3Envelope | null> {
  await requireSecureStorage();
  const stored = await SecureStore.getItemAsync(VAULT_V3_CANDIDATE_KEY, VAULT_OPTIONS);
  if (stored === null) return null;
  try {
    const envelope: unknown = JSON.parse(stored);
    if (!isVaultV3Envelope(envelope)) throw new VaultCorruptedError();
    return envelope;
  } catch (error) {
    if (error instanceof VaultCorruptedError) throw error;
    throw new VaultCorruptedError();
  }
}

export async function writeVaultV3Candidate(envelope: VaultV3Envelope): Promise<void> {
  await requireSecureStorage();
  if (!isVaultV3Envelope(envelope)) throw new VaultCorruptedError();
  await SecureStore.setItemAsync(VAULT_V3_CANDIDATE_KEY, JSON.stringify(envelope), VAULT_OPTIONS);
}

export async function deleteVaultV3Candidate(): Promise<void> {
  await requireSecureStorage();
  await SecureStore.deleteItemAsync(VAULT_V3_CANDIDATE_KEY, VAULT_OPTIONS);
}
