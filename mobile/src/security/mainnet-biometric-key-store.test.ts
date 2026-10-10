import { describe, expect, it, vi } from 'vitest';

import { readMainnetBiometricKeyRegistry, storeMainnetBiometricWrappingKey } from './mainnet-biometric-key-store';

const { store, get, capability } = vi.hoisted(() => ({ store: vi.fn(), get: vi.fn(), capability: vi.fn() }));
vi.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'device-only',
  getItemAsync: get, setItemAsync: store, canUseBiometricAuthentication: capability,
}));

describe('Mainnet biometric key storage', () => {
  it('uses an independent Mainnet registry key', async () => {
    get.mockResolvedValue(null);
    await expect(readMainnetBiometricKeyRegistry()).resolves.toEqual([]);
    expect(get).toHaveBeenCalledWith('aurionxi.wallet.bsc-mainnet.v1.biometric-registry', expect.any(Object));
  });

  it('refuses malformed protected-key input', async () => {
    await expect(storeMainnetBiometricWrappingKey('bad', 'bad')).rejects.toThrow('invalid');
  });
});
