import { beforeEach, describe, expect, it, vi } from 'vitest';

const secureStore = vi.hoisted(() => ({
  getItemAsync: vi.fn(),
  isAvailableAsync: vi.fn(),
  setItemAsync: vi.fn(),
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 6,
}));
vi.mock('expo-secure-store', () => secureStore);

// The module under test must load after its native dependency is mocked.
// eslint-disable-next-line import/first
import { createCandidateActiveSlotRecord } from './vault-active-slot-core';
// eslint-disable-next-line import/first
import { readVaultActiveSlot, writeVaultActiveSlot } from './vault-active-slot-store';

const record = createCandidateActiveSlotRecord('a'.repeat(32));

describe('vault active-slot SecureStore boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    secureStore.isAvailableAsync.mockResolvedValue(true);
  });

  it('writes strict non-secret pointer metadata to its own service', async () => {
    await writeVaultActiveSlot(record);
    expect(secureStore.setItemAsync).toHaveBeenCalledWith(
      'aurionxi.wallet.active-slot.v1',
      JSON.stringify(record),
      expect.objectContaining({
        keychainService: 'com.aurionxi.wallet.active-slot',
        requireAuthentication: false,
      }),
    );
  });

  it('reads valid metadata and rejects corrupt or expanded records', async () => {
    secureStore.getItemAsync.mockResolvedValueOnce(JSON.stringify(record));
    await expect(readVaultActiveSlot()).resolves.toEqual(record);
    secureStore.getItemAsync.mockResolvedValueOnce(JSON.stringify({ ...record, pin: 'blocked' }));
    await expect(readVaultActiveSlot()).rejects.toThrow('invalid or corrupted');
  });

  it('fails closed when secure storage is unavailable', async () => {
    secureStore.isAvailableAsync.mockResolvedValue(false);
    await expect(readVaultActiveSlot()).rejects.toThrow('unavailable');
    await expect(writeVaultActiveSlot(record)).rejects.toThrow('unavailable');
  });
});
