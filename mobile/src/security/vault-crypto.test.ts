import { describe, expect, it, vi } from 'vitest';

vi.mock('expo-crypto', () => ({
  AESSealedData: { fromCombined: vi.fn() },
  AESEncryptionKey: { import: vi.fn() },
  aesDecryptAsync: vi.fn(),
  aesEncryptAsync: vi.fn(),
}));

// The module under test must load after its native dependency is mocked.
// eslint-disable-next-line import/first
import {
  decryptVaultPayload,
  encryptVaultPayload,
  VaultCryptographyError,
} from './vault-crypto';

const metadata = {
  createdAt: '2026-08-06T12:00:00.000Z',
  publicAddress: '0x0000000000000000000000000000000000000001' as const,
  saltHex: '000102030405060708090a0b0c0d0e0f',
};

describe('vault cryptography boundary', () => {
  it('rejects malformed keys before calling native encryption', async () => {
    await expect(encryptVaultPayload(new Uint8Array([1]), '00', metadata)).rejects.toBeInstanceOf(
      VaultCryptographyError
    );
  });

  it('rejects an empty payload before native encryption', async () => {
    await expect(
      encryptVaultPayload(new Uint8Array(), 'a'.repeat(64), metadata)
    ).rejects.toThrow('The vault payload is empty.');
  });

  it('rejects malformed authenticated metadata', async () => {
    await expect(
      encryptVaultPayload(new Uint8Array([1]), 'a'.repeat(64), {
        ...metadata,
        saltHex: '00',
      })
    ).rejects.toThrow('The vault KDF salt is invalid.');
  });

  it('rejects malformed stored Base64 before native decryption', async () => {
    await expect(
      decryptVaultPayload(
        {
          ciphertext: '%%%not-base64%%%',
          createdAt: metadata.createdAt,
          format: 'aurionxi-vault-v2',
          kdf: { algorithm: 'argon2id', saltHex: metadata.saltHex },
          publicAddress: metadata.publicAddress,
        },
        'a'.repeat(64)
      )
    ).rejects.toBeInstanceOf(VaultCryptographyError);
  });
});
