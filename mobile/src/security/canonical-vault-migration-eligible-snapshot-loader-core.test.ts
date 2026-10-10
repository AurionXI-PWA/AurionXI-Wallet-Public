import { describe, expect, it, vi } from 'vitest';

import type { CanonicalVaultMigrationSnapshot } from './canonical-vault-migration-policy';
import { loadEligibleCanonicalVaultMigrationSnapshotWith } from './canonical-vault-migration-eligible-snapshot-loader-core';
import type { VaultV3Envelope } from './vault-envelope-v3';
import type { WalletIdentityRecord } from './wallet-identity-record-core';

const transactionId = 'a'.repeat(32);
const candidate: VaultV3Envelope = {
  createdAt: '2026-08-09T00:00:00.000Z',
  format: 'aurionxi-vault-v3',
  payloadCiphertext: 'A'.repeat(40),
  pin: { algorithm: 'argon2id', saltHex: 'b'.repeat(32), wrappedVaultKey: 'B'.repeat(40) },
  publicAddress: '0x2222222222222222222222222222222222222222',
};
const previousIdentity: WalletIdentityRecord = {
  derivationPath: "m/44'/60'/0'/0/0",
  format: 'aurionxi-wallet-identity-v1',
  publicAddress: '0x1111111111111111111111111111111111111111',
  vaultCreatedAt: '2026-08-08T00:00:00.000Z',
};
const activeIdentity: WalletIdentityRecord = {
  ...previousIdentity,
  publicAddress: candidate.publicAddress,
  vaultCreatedAt: candidate.createdAt,
};

function eligibleSnapshot(): CanonicalVaultMigrationSnapshot {
  return {
    activeSlot: { activeSlot: 'candidate', format: 'aurionxi-vault-active-slot-v1', transactionId },
    candidate,
    cleanupJournal: {
      activeIdentity,
      createdAt: '2026-08-09T00:30:00.000Z',
      format: 'aurionxi-retired-primary-cleanup-v1',
      phase: 'finalized',
      replacementTransactionId: transactionId,
      retiredIdentity: previousIdentity,
      retiredPrimaryStatus: 'present',
    },
    currentIdentity: activeIdentity,
    identityTransitionJournal: {
      createdAt: '2026-08-09T00:15:00.000Z',
      format: 'aurionxi-wallet-identity-transition-v1',
      nextIdentity: activeIdentity,
      phase: 'identity-verified',
      previousIdentity,
      replacementTransactionId: transactionId,
    },
    migrationJournal: null,
    primary: null,
    replacementJournal: {
      candidatePublicAddress: candidate.publicAddress,
      createdAt: '2026-08-09T00:10:00.000Z',
      format: 'aurionxi-vault-replacement-journal-v1',
      phase: 'cleanup-pending',
      targetStatus: 'present',
      transactionId,
    },
  };
}

describe('canonical migration read-only eligible snapshot loader foundation', () => {
  it('returns the same complete snapshot only for exact intent eligibility', async () => {
    const snapshot = eligibleSnapshot();
    await expect(loadEligibleCanonicalVaultMigrationSnapshotWith(
      vi.fn().mockResolvedValue(snapshot),
    )).resolves.toBe(snapshot);
  });

  it('rejects a complete but ineligible snapshot without mutation', async () => {
    const snapshot = { ...eligibleSnapshot(), primary: candidate };
    await expect(loadEligibleCanonicalVaultMigrationSnapshotWith(
      vi.fn().mockResolvedValue(snapshot),
    )).rejects.toThrow('not currently eligible');
    expect(snapshot.primary).toBe(candidate);
  });

  it('propagates read failure and has no writer dependency', async () => {
    const readSnapshot = vi.fn().mockRejectedValue(new Error('read failed'));
    await expect(loadEligibleCanonicalVaultMigrationSnapshotWith(readSnapshot))
      .rejects.toThrow('read failed');
    expect(loadEligibleCanonicalVaultMigrationSnapshotWith.length).toBe(1);
  });
});
