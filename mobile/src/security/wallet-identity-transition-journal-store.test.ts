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
import { createWalletIdentityRecord } from './wallet-identity-record-core';
// eslint-disable-next-line import/first
import { createWalletIdentityTransitionJournal } from './wallet-identity-transition-journal-core';
// eslint-disable-next-line import/first
import {
  readWalletIdentityTransitionJournal,
  writeWalletIdentityTransitionJournal,
  writeWalletIdentityTransitionJournalVerified,
} from './wallet-identity-transition-journal-store';

const journal = createWalletIdentityTransitionJournal(
  createWalletIdentityRecord(
    '0x0000000000000000000000000000000000000001',
    '2026-08-08T00:00:00.000Z',
  ),
  createWalletIdentityRecord(
    '0x0000000000000000000000000000000000000002',
    '2026-08-09T00:00:00.000Z',
  ),
  '0123456789abcdef0123456789abcdef',
  '2026-08-09T00:01:00.000Z',
);

describe('wallet identity transition journal SecureStore boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    secureStore.isAvailableAsync.mockResolvedValue(true);
  });

  it('writes strict public transition metadata to a dedicated service', async () => {
    await writeWalletIdentityTransitionJournal(journal);
    expect(secureStore.setItemAsync).toHaveBeenCalledWith(
      'aurionxi.wallet.identity-transition-journal.v1',
      JSON.stringify(journal),
      expect.objectContaining({
        keychainService: 'com.aurionxi.wallet.identity-transition-journal',
        requireAuthentication: false,
      }),
    );
  });

  it('reads valid metadata and rejects malformed or expanded records', async () => {
    secureStore.getItemAsync.mockResolvedValueOnce(JSON.stringify(journal));
    await expect(readWalletIdentityTransitionJournal()).resolves.toEqual(journal);
    secureStore.getItemAsync.mockResolvedValueOnce(JSON.stringify({ ...journal, pin: 'blocked' }));
    await expect(readWalletIdentityTransitionJournal()).rejects.toThrow('invalid or corrupted');
  });

  it('verifies every stored field after a write', async () => {
    secureStore.getItemAsync.mockResolvedValueOnce(JSON.stringify(journal));
    await expect(writeWalletIdentityTransitionJournalVerified(journal)).resolves.toEqual(journal);
  });

  it('fails when read-back is missing or differs', async () => {
    secureStore.getItemAsync.mockResolvedValueOnce(null);
    await expect(writeWalletIdentityTransitionJournalVerified(journal)).rejects.toThrow(
      'failed read-back verification',
    );
    secureStore.getItemAsync.mockResolvedValueOnce(JSON.stringify({
      ...journal,
      phase: 'identity-written',
    }));
    await expect(writeWalletIdentityTransitionJournalVerified(journal)).rejects.toThrow(
      'failed read-back verification',
    );
  });

  it('fails closed when secure storage is unavailable', async () => {
    secureStore.isAvailableAsync.mockResolvedValue(false);
    await expect(readWalletIdentityTransitionJournal()).rejects.toThrow('unavailable');
    await expect(writeWalletIdentityTransitionJournal(journal)).rejects.toThrow('unavailable');
  });
});
