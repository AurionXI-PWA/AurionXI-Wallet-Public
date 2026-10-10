import { beforeEach, describe, expect, it, vi } from 'vitest';

const secureStore = vi.hoisted(() => ({
  deleteItemAsync: vi.fn(),
  getItemAsync: vi.fn(),
  isAvailableAsync: vi.fn(),
  setItemAsync: vi.fn(),
}));

vi.mock('expo-secure-store', () => ({
  ...secureStore,
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 6,
}));

// The module under test must load after its native dependency is mocked.
// eslint-disable-next-line import/first
import {
  getVaultStatus,
  readEncryptedVault,
  readVaultV3,
  readVaultV3Candidate,
  VaultCorruptedError,
  VaultStorageUnavailableError,
  writeEncryptedVault,
  writeVaultV3,
  writeVaultV3Candidate,
} from './vault-store';

const envelope = {
  format: 'aurionxi-vault-v2' as const,
  publicAddress: '0x0000000000000000000000000000000000000001' as const,
  ciphertext: 'A'.repeat(32),
  createdAt: '2026-07-30T12:00:00.000Z',
  kdf: {
    algorithm: 'argon2id' as const,
    saltHex: '000102030405060708090a0b0c0d0e0f',
  },
};

const envelopeV3 = {
  createdAt: envelope.createdAt,
  format: 'aurionxi-vault-v3' as const,
  payloadCiphertext: 'A'.repeat(40),
  pin: {
    algorithm: 'argon2id' as const,
    saltHex: envelope.kdf.saltHex,
    wrappedVaultKey: 'B'.repeat(40),
  },
  publicAddress: envelope.publicAddress,
};

describe('secure vault storage boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    secureStore.isAvailableAsync.mockResolvedValue(true);
  });

  it('fails closed when secure device storage is unavailable', async () => {
    secureStore.isAvailableAsync.mockResolvedValue(false);
    await expect(readEncryptedVault()).rejects.toBeInstanceOf(VaultStorageUnavailableError);
  });

  it('writes only a validated encrypted envelope', async () => {
    await writeEncryptedVault(envelope);
    expect(secureStore.setItemAsync).toHaveBeenCalledOnce();
    expect(secureStore.setItemAsync.mock.calls[0][1]).not.toContain('mnemonic');
  });

  it('reports corrupt storage without treating it as an empty wallet', async () => {
    secureStore.getItemAsync.mockResolvedValue('not-json');
    await expect(getVaultStatus()).resolves.toBe('corrupt');
    await expect(readEncryptedVault()).rejects.toBeInstanceOf(VaultCorruptedError);
  });

  it('does not fall back to a legacy vault when a v3 slot is corrupt', async () => {
    secureStore.getItemAsync
      .mockResolvedValue(JSON.stringify(envelope))
      .mockResolvedValueOnce('{"format":"aurionxi-vault-v3","partial":true}');

    await expect(getVaultStatus()).resolves.toBe('corrupt');
    expect(secureStore.getItemAsync).toHaveBeenCalledOnce();
    expect(secureStore.setItemAsync).not.toHaveBeenCalled();
    expect(secureStore.deleteItemAsync).not.toHaveBeenCalled();
  });

  it('does not read or mutate vault slots when secure storage is unavailable', async () => {
    secureStore.isAvailableAsync.mockResolvedValue(false);

    await expect(getVaultStatus()).resolves.toBe('unsupported');
    expect(secureStore.getItemAsync).not.toHaveBeenCalled();
    expect(secureStore.setItemAsync).not.toHaveBeenCalled();
    expect(secureStore.deleteItemAsync).not.toHaveBeenCalled();
  });

  it('propagates storage read failures without creating or deleting a vault', async () => {
    secureStore.getItemAsync.mockRejectedValue(new Error('keystore read failed'));

    await expect(getVaultStatus()).rejects.toThrow('keystore read failed');
    expect(secureStore.setItemAsync).not.toHaveBeenCalled();
    expect(secureStore.deleteItemAsync).not.toHaveBeenCalled();
  });

  it('reports a valid encrypted vault as present', async () => {
    secureStore.getItemAsync
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValue(JSON.stringify(envelope));
    await expect(getVaultStatus()).resolves.toBe('present');
    await expect(readEncryptedVault()).resolves.toEqual(envelope);
  });

  it('prefers and validates the v3 storage slot', async () => {
    secureStore.getItemAsync.mockResolvedValue(JSON.stringify(envelopeV3));
    await expect(getVaultStatus()).resolves.toBe('present');
    await expect(readVaultV3()).resolves.toEqual(envelopeV3);
  });

  it('writes only a complete v3 envelope', async () => {
    await writeVaultV3(envelopeV3);
    expect(secureStore.setItemAsync).toHaveBeenCalledOnce();
    await expect(writeVaultV3({ ...envelopeV3, payloadCiphertext: '' })).rejects.toBeInstanceOf(
      VaultCorruptedError,
    );
  });

  it('keeps a validated replacement candidate in a distinct storage slot', async () => {
    await writeVaultV3Candidate(envelopeV3);
    expect(secureStore.setItemAsync).toHaveBeenCalledWith(
      expect.stringContaining('candidate'),
      JSON.stringify(envelopeV3),
      expect.any(Object),
    );

    secureStore.getItemAsync.mockResolvedValue(JSON.stringify(envelopeV3));
    await expect(readVaultV3Candidate()).resolves.toEqual(envelopeV3);
  });
});
