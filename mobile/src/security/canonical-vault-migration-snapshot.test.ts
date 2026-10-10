import { describe, expect, it, vi } from 'vitest';

import type { CanonicalVaultMigrationSnapshotDependencies } from './canonical-vault-migration-snapshot-core';
import { readCanonicalVaultMigrationSnapshotWith } from './canonical-vault-migration-snapshot-core';
import type { VaultV3Envelope } from './vault-envelope-v3';

const transactionId = 'a'.repeat(32);
const activeSlot = { activeSlot: 'candidate', format: 'aurionxi-vault-active-slot-v1', transactionId } as const;
const candidate: VaultV3Envelope = {
  createdAt: '2026-08-09T00:00:00.000Z',
  format: 'aurionxi-vault-v3',
  payloadCiphertext: 'A'.repeat(40),
  pin: { algorithm: 'argon2id', saltHex: 'b'.repeat(32), wrappedVaultKey: 'B'.repeat(40) },
  publicAddress: '0x2222222222222222222222222222222222222222',
};

function dependencies(): CanonicalVaultMigrationSnapshotDependencies {
  return {
    readActiveSlot: vi.fn().mockResolvedValue(activeSlot),
    readCandidate: vi.fn().mockResolvedValue(candidate),
    readCleanupJournal: vi.fn().mockResolvedValue(null),
    readCurrentIdentity: vi.fn().mockResolvedValue(null),
    readIdentityTransitionJournal: vi.fn().mockResolvedValue(null),
    readMigrationJournal: vi.fn().mockResolvedValue(null),
    readPrimary: vi.fn().mockResolvedValue(null),
    readReplacementJournal: vi.fn().mockResolvedValue(null),
  };
}

describe('canonical vault migration read-only snapshot boundary', () => {
  it('collects every required slot and authority record without mutation dependencies', async () => {
    const deps = dependencies();
    await expect(readCanonicalVaultMigrationSnapshotWith(deps)).resolves.toEqual({
      activeSlot,
      candidate,
      cleanupJournal: null,
      currentIdentity: null,
      identityTransitionJournal: null,
      migrationJournal: null,
      primary: null,
      replacementJournal: null,
    });
    expect(Object.keys(deps).sort()).toEqual([
      'readActiveSlot',
      'readCandidate',
      'readCleanupJournal',
      'readCurrentIdentity',
      'readIdentityTransitionJournal',
      'readMigrationJournal',
      'readPrimary',
      'readReplacementJournal',
    ]);
  });

  it('rejects an active pointer change during verification', async () => {
    const deps = dependencies();
    vi.mocked(deps.readActiveSlot)
      .mockResolvedValueOnce(activeSlot)
      .mockResolvedValueOnce({ activeSlot: 'primary', format: 'aurionxi-vault-active-slot-v1' });
    await expect(readCanonicalVaultMigrationSnapshotWith(deps)).rejects.toThrow('state changed');
  });

  it('rejects a migration journal phase change during verification', async () => {
    const deps = dependencies();
    const journal = {
      candidateCreatedAt: candidate.createdAt,
      candidatePublicAddress: candidate.publicAddress,
      createdAt: '2026-08-09T01:00:00.000Z',
      format: 'aurionxi-canonical-vault-migration-v1',
      phase: 'intent-recorded',
      replacementTransactionId: transactionId,
    } as const;
    vi.mocked(deps.readMigrationJournal)
      .mockResolvedValueOnce(journal)
      .mockResolvedValueOnce({ ...journal, phase: 'primary-written' });
    await expect(readCanonicalVaultMigrationSnapshotWith(deps)).rejects.toThrow('state changed');
  });

  it('propagates corrupt or unavailable storage errors instead of publishing a partial snapshot', async () => {
    const deps = dependencies();
    vi.mocked(deps.readCleanupJournal).mockRejectedValue(new Error('corrupt'));
    await expect(readCanonicalVaultMigrationSnapshotWith(deps)).rejects.toThrow('corrupt');
  });
});
