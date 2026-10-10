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
import type { CanonicalVaultMigrationJournal } from './canonical-vault-migration-journal-core';
// eslint-disable-next-line import/first
import {
  readCanonicalVaultMigrationJournal,
  writeCanonicalVaultMigrationJournal,
  writeCanonicalVaultMigrationJournalVerified,
} from './canonical-vault-migration-journal-store';

const journal: CanonicalVaultMigrationJournal = {
  candidateCreatedAt: '2026-08-09T00:00:00.000Z',
  candidatePublicAddress: '0x2222222222222222222222222222222222222222',
  createdAt: '2026-08-09T01:00:00.000Z',
  format: 'aurionxi-canonical-vault-migration-v1',
  phase: 'intent-recorded',
  replacementTransactionId: 'a'.repeat(32),
};

describe('canonical vault migration journal SecureStore boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    secureStore.isAvailableAsync.mockResolvedValue(true);
  });

  it('stores strict public migration metadata in a dedicated device-bound service', async () => {
    await writeCanonicalVaultMigrationJournal(journal);
    expect(secureStore.setItemAsync).toHaveBeenCalledWith(
      'aurionxi.wallet.canonical-vault-migration-journal.v1',
      JSON.stringify(journal),
      expect.objectContaining({
        keychainAccessible: 6,
        keychainService: 'com.aurionxi.wallet.canonical-vault-migration-journal',
        requireAuthentication: false,
      }),
    );
  });

  it('returns null for an absent journal and reads valid strict metadata', async () => {
    secureStore.getItemAsync.mockResolvedValueOnce(null);
    await expect(readCanonicalVaultMigrationJournal()).resolves.toBeNull();
    secureStore.getItemAsync.mockResolvedValueOnce(JSON.stringify(journal));
    await expect(readCanonicalVaultMigrationJournal()).resolves.toEqual(journal);
  });

  it('rejects malformed, expanded, or secret-bearing records', async () => {
    secureStore.getItemAsync.mockResolvedValueOnce('{bad');
    await expect(readCanonicalVaultMigrationJournal()).rejects.toThrow('invalid or corrupted');
    secureStore.getItemAsync.mockResolvedValueOnce(JSON.stringify({ ...journal, pin: 'blocked' }));
    await expect(readCanonicalVaultMigrationJournal()).rejects.toThrow('invalid or corrupted');
    await expect(writeCanonicalVaultMigrationJournal({
      ...journal,
      payloadCiphertext: 'blocked',
    } as CanonicalVaultMigrationJournal)).rejects.toThrow('journal is invalid');
  });

  it('verifies every persisted field after a write', async () => {
    secureStore.getItemAsync.mockResolvedValueOnce(JSON.stringify(journal));
    await expect(writeCanonicalVaultMigrationJournalVerified(journal)).resolves.toEqual(journal);
  });

  it('fails read-back when the record is missing or differs', async () => {
    secureStore.getItemAsync.mockResolvedValueOnce(null);
    await expect(writeCanonicalVaultMigrationJournalVerified(journal)).rejects.toThrow(
      'failed read-back verification',
    );
    secureStore.getItemAsync.mockResolvedValueOnce(JSON.stringify({ ...journal, phase: 'primary-written' }));
    await expect(writeCanonicalVaultMigrationJournalVerified(journal)).rejects.toThrow(
      'failed read-back verification',
    );
  });

  it('fails closed when secure storage is unavailable', async () => {
    secureStore.isAvailableAsync.mockResolvedValue(false);
    await expect(readCanonicalVaultMigrationJournal()).rejects.toThrow('unavailable');
    await expect(writeCanonicalVaultMigrationJournal(journal)).rejects.toThrow('unavailable');
    expect(secureStore.setItemAsync).not.toHaveBeenCalled();
  });

  it('does not expose a journal deletion API', async () => {
    const store = await import('./canonical-vault-migration-journal-store');
    expect(store).not.toHaveProperty('deleteCanonicalVaultMigrationJournal');
  });
});
