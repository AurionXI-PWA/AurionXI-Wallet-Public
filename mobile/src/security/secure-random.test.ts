import { expect, it, vi } from 'vitest';

const getRandomBytesAsync = vi.hoisted(() => vi.fn());

vi.mock('expo-crypto', () => ({ getRandomBytesAsync }));

// The module under test must load after its native dependency is mocked.
// eslint-disable-next-line import/first
import {
  ARGON2_SALT_BYTES,
  generateArgon2SaltHex,
  generateVaultKeyBytes,
  generateVaultKeyHex,
  VAULT_KEY_BYTES,
} from './secure-random';

it('requests a 256-bit key from the native asynchronous random source', async () => {
  getRandomBytesAsync.mockResolvedValue(new Uint8Array(VAULT_KEY_BYTES));

  await expect(generateVaultKeyBytes()).resolves.toHaveLength(32);
  expect(getRandomBytesAsync).toHaveBeenCalledWith(32);
});

it('fails closed if the native source returns an invalid length', async () => {
  getRandomBytesAsync.mockResolvedValue(new Uint8Array(16));

  await expect(generateVaultKeyBytes()).rejects.toThrow('invalid key length');
});

it('encodes a generated vault key as 64 lowercase hex characters', async () => {
  getRandomBytesAsync.mockResolvedValue(Uint8Array.from({ length: VAULT_KEY_BYTES }, (_, i) => i));
  await expect(generateVaultKeyHex()).resolves.toBe(
    '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f',
  );
});

it('generates a lowercase 16-byte Argon2 salt', async () => {
  getRandomBytesAsync.mockResolvedValue(Uint8Array.from({ length: ARGON2_SALT_BYTES }, (_, i) => i));

  await expect(generateArgon2SaltHex()).resolves.toBe('000102030405060708090a0b0c0d0e0f');
  expect(getRandomBytesAsync).toHaveBeenCalledWith(ARGON2_SALT_BYTES);
});
