import { beforeEach, describe, expect, it, vi } from 'vitest';

const secureStore = vi.hoisted(() => ({
  deleteItemAsync: vi.fn(),
  getItemAsync: vi.fn(),
  setItemAsync: vi.fn(),
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 6,
}));
vi.mock('expo-secure-store', () => secureStore);

// The module under test must load after its native dependency is mocked.
// eslint-disable-next-line import/first
import { createVerifiedCandidateJournal } from './vault-replacement-journal-core';
// eslint-disable-next-line import/first
import {
  deleteVaultReplacementJournal,
  readVaultReplacementJournal,
  writeVaultReplacementJournal,
} from './vault-replacement-journal-store';

const journal = createVerifiedCandidateJournal(
  { createdAt: '2026-08-09T00:00:00.000Z', format: 'aurionxi-vault-v3', payloadCiphertext: 'C'.repeat(40), pin: { algorithm: 'argon2id', saltHex: '1'.repeat(32), wrappedVaultKey: 'D'.repeat(40) }, publicAddress: '0x0000000000000000000000000000000000000002' },
  'present',
  'a'.repeat(32),
  '2026-08-09T01:00:00.000Z',
);

describe('vault replacement journal store', () => {
  beforeEach(() => vi.clearAllMocks());

  it('stores non-secret metadata without biometric authentication', async () => {
    await writeVaultReplacementJournal(journal);
    expect(secureStore.setItemAsync).toHaveBeenCalledWith(
      'aurionxi.wallet.vault.replacement-journal.v1',
      JSON.stringify(journal),
      expect.objectContaining({ requireAuthentication: false }),
    );
  });

  it('reads valid metadata and rejects corrupt data', async () => {
    secureStore.getItemAsync.mockResolvedValueOnce(JSON.stringify(journal));
    await expect(readVaultReplacementJournal()).resolves.toEqual(journal);
    secureStore.getItemAsync.mockResolvedValueOnce('{bad');
    await expect(readVaultReplacementJournal()).rejects.toThrow('invalid or corrupted');
  });

  it('deletes only the journal key when explicitly requested', async () => {
    await deleteVaultReplacementJournal();
    expect(secureStore.deleteItemAsync).toHaveBeenCalledWith(
      'aurionxi.wallet.vault.replacement-journal.v1',
      expect.any(Object),
    );
  });
});
