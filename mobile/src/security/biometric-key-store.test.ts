import { beforeEach, describe, expect, it, vi } from 'vitest';

const secureStore = vi.hoisted(() => ({
  canUseBiometricAuthentication: vi.fn(),
  deleteItemAsync: vi.fn(),
  getItemAsync: vi.fn(),
  setItemAsync: vi.fn(),
}));

vi.mock('expo-secure-store', () => ({
  ...secureStore,
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 6,
}));

// The module under test must load after its native dependency is mocked.
// eslint-disable-next-line import/first
import {
  deleteBiometricWrappingKey,
  readBiometricKeyRegistry,
  readBiometricWrappingKey,
  storeBiometricWrappingKey,
} from './biometric-key-store';

const keyId = 'a'.repeat(32);
const keyHex = 'b'.repeat(64);

beforeEach(() => {
  vi.clearAllMocks();
  secureStore.canUseBiometricAuthentication.mockResolvedValue(true);
});

describe('biometric protected key storage', () => {
  it('stores only a validated random wrapping key with authentication required', async () => {
    await storeBiometricWrappingKey(keyId, keyHex);
    expect(secureStore.setItemAsync).toHaveBeenCalledWith(
      expect.stringContaining(keyId),
      keyHex,
      expect.objectContaining({ requireAuthentication: true }),
    );
  });

  it('fails closed when biometric protected storage is unavailable', async () => {
    secureStore.canUseBiometricAuthentication.mockResolvedValue(false);
    await expect(storeBiometricWrappingKey(keyId, keyHex)).rejects.toThrow('unavailable');
    expect(secureStore.setItemAsync).not.toHaveBeenCalled();
  });

  it('treats a missing, invalidated, or malformed protected value as unavailable', async () => {
    secureStore.getItemAsync.mockResolvedValue(null);
    await expect(readBiometricWrappingKey(keyId)).resolves.toBeNull();
    secureStore.getItemAsync.mockResolvedValue('not-a-key');
    await expect(readBiometricWrappingKey(keyId)).resolves.toBeNull();
  });

  it('tracks the key reference before protected storage and rolls metadata back on failure', async () => {
    secureStore.getItemAsync.mockResolvedValue(null);
    secureStore.setItemAsync
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('protected write failed'))
      .mockResolvedValueOnce(undefined);
    await expect(storeBiometricWrappingKey(keyId, keyHex)).rejects.toThrow('protected write failed');
    expect(secureStore.setItemAsync).toHaveBeenCalledTimes(3);
  });

  it('normalizes malformed and duplicate registry entries', async () => {
    secureStore.getItemAsync.mockResolvedValue(JSON.stringify([keyId, keyId, 'bad']));
    await expect(readBiometricKeyRegistry()).resolves.toEqual([keyId]);
  });

  it('removes registry tracking only after the protected orphan key is deleted', async () => {
    secureStore.deleteItemAsync.mockResolvedValue(undefined);
    secureStore.getItemAsync.mockResolvedValue(JSON.stringify([keyId]));

    await deleteBiometricWrappingKey(keyId);

    expect(secureStore.deleteItemAsync).toHaveBeenCalledWith(
      expect.stringContaining(keyId),
      expect.objectContaining({ requireAuthentication: true }),
    );
    expect(secureStore.setItemAsync).toHaveBeenCalledWith(
      expect.any(String),
      '[]',
      expect.objectContaining({ requireAuthentication: false }),
    );
  });

  it('retains registry tracking when protected orphan deletion fails', async () => {
    secureStore.deleteItemAsync.mockRejectedValue(new Error('delete failed'));

    await expect(deleteBiometricWrappingKey(keyId)).rejects.toThrow('delete failed');

    expect(secureStore.getItemAsync).not.toHaveBeenCalled();
    expect(secureStore.setItemAsync).not.toHaveBeenCalled();
  });
});
