import * as SecureStore from 'expo-secure-store';

import { getNamespacedVaultStorageKey } from './vault-network-namespace';

const KEY_PREFIX = 'aurionxi.wallet.bsc-mainnet.v1.biometric-wrap.';
const KEY_SERVICE = 'com.aurionxi.wallet.bsc-mainnet.v1.biometric-wrap';
const REGISTRY_KEY = getNamespacedVaultStorageKey('bsc-mainnet', 'biometric-registry');
const REGISTRY_SERVICE = 'com.aurionxi.wallet.bsc-mainnet.v1.biometric-registry';
const KEY_ID_PATTERN = /^[a-f0-9]{32}$/;
const KEY_HEX_PATTERN = /^[a-f0-9]{64}$/;

const keyOptions: SecureStore.SecureStoreOptions = {
  authenticationPrompt: 'Verify your identity to unlock your wallet',
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  keychainService: KEY_SERVICE,
  requireAuthentication: true,
};
const registryOptions: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  keychainService: REGISTRY_SERVICE,
  requireAuthentication: false,
};

export async function readMainnetBiometricKeyRegistry(): Promise<string[]> {
  const raw = await SecureStore.getItemAsync(REGISTRY_KEY, registryOptions);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? [...new Set(parsed.filter((value): value is string => typeof value === 'string' && KEY_ID_PATTERN.test(value)))] : [];
  } catch {
    return [];
  }
}

export async function storeMainnetBiometricWrappingKey(keyId: string, wrappingKeyHex: string): Promise<void> {
  if (!KEY_ID_PATTERN.test(keyId) || !KEY_HEX_PATTERN.test(wrappingKeyHex)) throw new Error('The biometric wrapping key is invalid.');
  if (!(await SecureStore.canUseBiometricAuthentication())) throw new Error('Biometric-protected storage is unavailable.');
  const previous = await readMainnetBiometricKeyRegistry();
  await SecureStore.setItemAsync(REGISTRY_KEY, JSON.stringify([...new Set([...previous, keyId])]), registryOptions);
  try {
    await SecureStore.setItemAsync(`${KEY_PREFIX}${keyId}`, wrappingKeyHex, keyOptions);
  } catch (error) {
    await SecureStore.setItemAsync(REGISTRY_KEY, JSON.stringify(previous), registryOptions);
    throw error;
  }
}

export async function readMainnetBiometricWrappingKey(keyId: string): Promise<string | null> {
  if (!KEY_ID_PATTERN.test(keyId) || !(await SecureStore.canUseBiometricAuthentication())) return null;
  const value = await SecureStore.getItemAsync(`${KEY_PREFIX}${keyId}`, keyOptions);
  return value && KEY_HEX_PATTERN.test(value) ? value : null;
}

export async function deleteMainnetBiometricWrappingKey(keyId: string): Promise<void> {
  if (!KEY_ID_PATTERN.test(keyId)) throw new Error('The biometric key reference is invalid.');
  await SecureStore.deleteItemAsync(`${KEY_PREFIX}${keyId}`, keyOptions);
  const tracked = await readMainnetBiometricKeyRegistry();
  await SecureStore.setItemAsync(REGISTRY_KEY, JSON.stringify(tracked.filter((value) => value !== keyId)), registryOptions);
}
