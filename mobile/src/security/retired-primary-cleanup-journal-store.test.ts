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
import { createRetiredPrimaryCleanupJournal } from './retired-primary-cleanup-journal-core';
// eslint-disable-next-line import/first
import {
  readRetiredPrimaryCleanupJournal,
  writeRetiredPrimaryCleanupJournal,
  writeRetiredPrimaryCleanupJournalVerified,
} from './retired-primary-cleanup-journal-store';
// eslint-disable-next-line import/first
import { createWalletIdentityRecord } from './wallet-identity-record-core';

const journal = createRetiredPrimaryCleanupJournal(
  createWalletIdentityRecord(
    '0x0000000000000000000000000000000000000001',
    '2026-08-08T00:00:00.000Z',
  ),
  createWalletIdentityRecord(
    '0x0000000000000000000000000000000000000002',
    '2026-08-09T00:00:00.000Z',
  ),
  'present',
  '0123456789abcdef0123456789abcdef',
  '2026-08-09T00:02:00.000Z',
);

describe('retired primary cleanup journal SecureStore boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    secureStore.isAvailableAsync.mockResolvedValue(true);
  });

  it('stores strict public cleanup metadata in a dedicated service', async () => {
    await writeRetiredPrimaryCleanupJournal(journal);
    expect(secureStore.setItemAsync).toHaveBeenCalledWith(
      'aurionxi.wallet.retired-primary-cleanup-journal.v1',
      JSON.stringify(journal),
      expect.objectContaining({
        keychainService: 'com.aurionxi.wallet.retired-primary-cleanup-journal',
        requireAuthentication: false,
      }),
    );
  });

  it('reads valid metadata and rejects malformed or expanded records', async () => {
    secureStore.getItemAsync.mockResolvedValueOnce(JSON.stringify(journal));
    await expect(readRetiredPrimaryCleanupJournal()).resolves.toEqual(journal);
    secureStore.getItemAsync.mockResolvedValueOnce(JSON.stringify({ ...journal, pin: 'blocked' }));
    await expect(readRetiredPrimaryCleanupJournal()).rejects.toThrow('invalid or corrupted');
    secureStore.getItemAsync.mockResolvedValueOnce('{bad');
    await expect(readRetiredPrimaryCleanupJournal()).rejects.toThrow('invalid or corrupted');
  });

  it('verifies every persisted cleanup field after write', async () => {
    secureStore.getItemAsync.mockResolvedValueOnce(JSON.stringify(journal));
    await expect(writeRetiredPrimaryCleanupJournalVerified(journal)).resolves.toEqual(journal);
  });

  it('fails read-back verification when stored journal is missing or differs', async () => {
    secureStore.getItemAsync.mockResolvedValueOnce(null);
    await expect(writeRetiredPrimaryCleanupJournalVerified(journal)).rejects.toThrow(
      'failed read-back verification',
    );
    secureStore.getItemAsync.mockResolvedValueOnce(JSON.stringify({
      ...journal,
      phase: 'primary-removed',
    }));
    await expect(writeRetiredPrimaryCleanupJournalVerified(journal)).rejects.toThrow(
      'failed read-back verification',
    );
  });

  it('fails closed when secure storage is unavailable', async () => {
    secureStore.isAvailableAsync.mockResolvedValue(false);
    await expect(readRetiredPrimaryCleanupJournal()).rejects.toThrow('unavailable');
    await expect(writeRetiredPrimaryCleanupJournal(journal)).rejects.toThrow('unavailable');
  });
});
