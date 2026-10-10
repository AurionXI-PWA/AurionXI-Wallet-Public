import * as SecureStore from 'expo-secure-store';

const KEY_PREFIX = 'aurionxi.wallet.biometric-wrap.v1.';
const KEY_SERVICE = 'com.aurionxi.wallet.biometric-wrap';
const KEY_HEX_PATTERN = /^[a-f0-9]{64}$/;
const KEY_ID_PATTERN = /^[a-f0-9]{32}$/;
const REGISTRY_KEY = 'aurionxi.wallet.biometric-wrap.registry.v1';
const REGISTRY_SERVICE = 'com.aurionxi.wallet.biometric-registry';

const options: SecureStore.SecureStoreOptions = {
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

export async function readBiometricKeyRegistry(): Promise<string[]> {
  const stored = await SecureStore.getItemAsync(REGISTRY_KEY, registryOptions);
  if (stored === null) return [];
  try {
    const parsed: unknown = JSON.parse(stored);
    return Array.isArray(parsed)
      ? [...new Set(parsed.filter((value): value is string => (
        typeof value === 'string' && KEY_ID_PATTERN.test(value)
      )))]
      : [];
  } catch {
    return [];
  }
}

async function writeRegistry(keyIds: string[]) {
  await SecureStore.setItemAsync(REGISTRY_KEY, JSON.stringify([...new Set(keyIds)]), registryOptions);
}

function storageKey(keyId: string): string {
  if (!KEY_ID_PATTERN.test(keyId)) throw new Error('The biometric key reference is invalid.');
  return `${KEY_PREFIX}${keyId}`;
}

export async function storeBiometricWrappingKey(keyId: string, wrappingKeyHex: string) {
  if (!KEY_HEX_PATTERN.test(wrappingKeyHex)) {
    throw new Error('The biometric wrapping key is invalid.');
  }
  if (!(await SecureStore.canUseBiometricAuthentication())) {
    throw new Error('Biometric-protected storage is unavailable.');
  }
  const previous = await readBiometricKeyRegistry();
  await writeRegistry([...previous, keyId]);
  try {
    await SecureStore.setItemAsync(storageKey(keyId), wrappingKeyHex, options);
  } catch (error) {
    await writeRegistry(previous);
    throw error;
  }
}

export async function readBiometricWrappingKey(keyId: string): Promise<string | null> {
  if (!(await SecureStore.canUseBiometricAuthentication())) return null;
  const value = await SecureStore.getItemAsync(storageKey(keyId), options);
  return value !== null && KEY_HEX_PATTERN.test(value) ? value : null;
}

export async function deleteBiometricWrappingKey(keyId: string): Promise<void> {
  await SecureStore.deleteItemAsync(storageKey(keyId), options);
  const tracked = await readBiometricKeyRegistry();
  await writeRegistry(tracked.filter((trackedId) => trackedId !== keyId));
}
