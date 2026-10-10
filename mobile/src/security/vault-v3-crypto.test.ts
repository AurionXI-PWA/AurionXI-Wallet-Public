import { beforeEach, describe, expect, it, vi } from 'vitest';

const cryptoMocks = vi.hoisted(() => ({
  decrypt: vi.fn(),
  encrypt: vi.fn(),
  fromCombined: vi.fn(),
  importKey: vi.fn(),
}));

vi.mock('expo-crypto', () => ({
  AESSealedData: { fromCombined: cryptoMocks.fromCombined },
  AESEncryptionKey: { import: cryptoMocks.importKey },
  aesDecryptAsync: cryptoMocks.decrypt,
  aesEncryptAsync: cryptoMocks.encrypt,
}));

// The module under test must load after its native dependency is mocked.
// eslint-disable-next-line import/first
import {
  decryptVaultV3Payload,
  encryptVaultV3Payload,
  unwrapVaultKeyForPin,
  wrapVaultKeyForPin,
} from './vault-v3-crypto';

const metadata = {
  createdAt: '2026-08-06T12:00:00.000Z',
  publicAddress: '0x0000000000000000000000000000000000000001' as const,
};
const key = 'a'.repeat(64);

beforeEach(() => {
  vi.clearAllMocks();
  cryptoMocks.importKey.mockResolvedValue({});
  cryptoMocks.encrypt.mockResolvedValue({ combined: vi.fn().mockResolvedValue('A'.repeat(40)) });
  cryptoMocks.fromCombined.mockReturnValue({});
  cryptoMocks.decrypt.mockResolvedValue(new Uint8Array(32));
});

describe('native v3 AES-GCM boundary', () => {
  it('domain-separates payload encryption from PIN key wrapping', async () => {
    await encryptVaultV3Payload(new Uint8Array([1]), key, metadata);
    const payloadAad = cryptoMocks.encrypt.mock.calls[0][2].additionalData;
    await wrapVaultKeyForPin(key, key, metadata);
    const wrappingAad = cryptoMocks.encrypt.mock.calls[1][2].additionalData;
    expect(new TextDecoder().decode(payloadAad)).toContain('"purpose":"payload"');
    expect(new TextDecoder().decode(wrappingAad)).toContain('"purpose":"pin-wrap"');
  });

  it('rejects malformed keys before native wrapping', async () => {
    expect(() => wrapVaultKeyForPin('00', key, metadata)).toThrow('vault key is invalid');
    expect(cryptoMocks.encrypt).not.toHaveBeenCalled();
  });

  it('requires an exact 256-bit key after authenticated unwrap', async () => {
    cryptoMocks.decrypt.mockResolvedValue(new Uint8Array(16));
    await expect(unwrapVaultKeyForPin('A'.repeat(40), key, metadata)).rejects.toThrow(
      'unwrapped vault key is invalid',
    );
  });

  it('fails closed when payload authentication fails', async () => {
    cryptoMocks.decrypt.mockRejectedValue(new Error('bad tag'));
    await expect(decryptVaultV3Payload('A'.repeat(40), key, metadata)).rejects.toThrow(
      'could not be authenticated',
    );
  });
});
