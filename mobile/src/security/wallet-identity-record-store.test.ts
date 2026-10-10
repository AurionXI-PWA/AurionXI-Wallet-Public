import { beforeEach, describe, expect, it, vi } from 'vitest';

const secureStore = vi.hoisted(() => ({
  deleteItemAsync: vi.fn(),
  getItemAsync: vi.fn(),
  isAvailableAsync: vi.fn(),
  setItemAsync: vi.fn(),
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 6,
}));
vi.mock('expo-secure-store', () => secureStore);

// The module under test must load after its native dependency is mocked.
// eslint-disable-next-line import/first
import { createWalletIdentityRecord } from './wallet-identity-record-core';
// eslint-disable-next-line import/first
import {
  deleteWalletIdentityRecord,
  readWalletIdentityRecord,
  writeWalletIdentityRecord,
} from './wallet-identity-record-store';

const record = createWalletIdentityRecord(
  '0x0000000000000000000000000000000000000001',
  '2026-08-09T00:00:00.000Z',
);

describe('authoritative wallet identity store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    secureStore.isAvailableAsync.mockResolvedValue(true);
  });

  it('writes strict public identity metadata to a separate non-biometric slot', async () => {
    await writeWalletIdentityRecord(record);
    expect(secureStore.setItemAsync).toHaveBeenCalledWith(
      'aurionxi.wallet.bsc-testnet.v1.identity',
      JSON.stringify(record),
      expect.objectContaining({
        keychainService: 'com.aurionxi.wallet.bsc-testnet.v1.identity',
        requireAuthentication: false,
      }),
    );
  });

  it('reads valid metadata and rejects malformed or expanded records', async () => {
    secureStore.getItemAsync.mockResolvedValueOnce(JSON.stringify(record));
    await expect(readWalletIdentityRecord()).resolves.toEqual(record);
    secureStore.getItemAsync.mockResolvedValueOnce(JSON.stringify({ ...record, pin: 'blocked' }));
    await expect(readWalletIdentityRecord()).rejects.toThrow('invalid or corrupted');
  });

  it('fails closed when secure storage is unavailable', async () => {
    secureStore.isAvailableAsync.mockResolvedValue(false);
    await expect(readWalletIdentityRecord()).rejects.toThrow('unavailable');
    await expect(writeWalletIdentityRecord(record)).rejects.toThrow('unavailable');
  });

  it('deletes only the identity slot when explicitly invoked for rollback', async () => {
    await deleteWalletIdentityRecord();
    expect(secureStore.deleteItemAsync).toHaveBeenCalledWith(
      'aurionxi.wallet.authoritative-identity.v1',
      expect.any(Object),
    );
  });
});
