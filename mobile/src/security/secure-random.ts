import { getRandomBytesAsync } from 'expo-crypto';

export const VAULT_KEY_BYTES = 32;
export const ARGON2_SALT_BYTES = 16;

export async function generateVaultKeyBytes(): Promise<Uint8Array> {
  const bytes = await getRandomBytesAsync(VAULT_KEY_BYTES);
  if (bytes.length !== VAULT_KEY_BYTES) {
    throw new Error('Secure random source returned an invalid key length.');
  }
  return bytes;
}

export async function generateVaultKeyHex(): Promise<string> {
  const bytes = await generateVaultKeyBytes();
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
}

export async function generateArgon2SaltHex(): Promise<string> {
  const bytes = await getRandomBytesAsync(ARGON2_SALT_BYTES);
  if (bytes.length !== ARGON2_SALT_BYTES) {
    throw new Error('Secure random source returned an invalid salt length.');
  }
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
}
