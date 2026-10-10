import { describe, expect, it, vi } from 'vitest';

import type { CanonicalVaultMigrationJournal } from './canonical-vault-migration-journal-core';
import type { CanonicalVaultMigrationSnapshot } from './canonical-vault-migration-policy';
import {
  executeCanonicalVaultPrimaryAuthoritativeAdvance,
  type CanonicalVaultPrimaryAuthoritativeExecutorDependencies,
} from './canonical-vault-primary-authoritative-executor-core';
import type { VaultV3Envelope } from './vault-envelope-v3';
import type { WalletIdentityRecord } from './wallet-identity-record-core';

const transactionId = 'a'.repeat(32);
const vault: VaultV3Envelope = {
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
  publicAddress: vault.publicAddress,
  vaultCreatedAt: vault.createdAt,
};
const primaryWritten: CanonicalVaultMigrationJournal = {
  candidateCreatedAt: vault.createdAt,
  candidatePublicAddress: vault.publicAddress,
  createdAt: '2026-08-09T02:00:00.000Z',
  format: 'aurionxi-canonical-vault-migration-v1',
  phase: 'primary-written',
  replacementTransactionId: transactionId,
};

function snapshot(migrationJournal: CanonicalVaultMigrationJournal): CanonicalVaultMigrationSnapshot {
  return {
    activeSlot: { activeSlot: 'primary', format: 'aurionxi-vault-active-slot-v1' },
    candidate: vault,
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
    migrationJournal,
    primary: vault,
    replacementJournal: {
      candidatePublicAddress: vault.publicAddress,
      createdAt: '2026-08-09T00:10:00.000Z',
      format: 'aurionxi-vault-replacement-journal-v1',
      phase: 'cleanup-pending',
      targetStatus: 'present',
      transactionId,
    },
  };
}

function harness() {
  let journal = primaryWritten;
  const dependencies: CanonicalVaultPrimaryAuthoritativeExecutorDependencies = {
    readSnapshot: vi.fn().mockImplementation(async () => snapshot(journal)),
    writeJournalVerified: vi.fn().mockImplementation(async (next) => {
      journal = next;
      return next;
    }),
  };
  return { dependencies, getJournal: () => journal };
}

describe('canonical primary-authoritative journal advance foundation', () => {
  it('records primary authority and verifies candidate removal is next', async () => {
    const test = harness();
    await expect(executeCanonicalVaultPrimaryAuthoritativeAdvance(test.dependencies)).resolves.toEqual({
      action: 'primary-authoritative-recorded',
    });
    expect(test.dependencies.writeJournalVerified).toHaveBeenCalledTimes(1);
    expect(test.dependencies.readSnapshot).toHaveBeenCalledTimes(2);
    expect(test.getJournal().phase).toBe('primary-authoritative');
  });

  it('exposes no vault, pointer, candidate, or delete mutation dependency', () => {
    expect(Object.keys(harness().dependencies).sort()).toEqual([
      'readSnapshot',
      'writeJournalVerified',
    ]);
  });

  it('does not write when the pointer is still candidate', async () => {
    const test = harness();
    vi.mocked(test.dependencies.readSnapshot).mockResolvedValueOnce({
      ...snapshot(primaryWritten),
      activeSlot: { activeSlot: 'candidate', format: 'aurionxi-vault-active-slot-v1', transactionId },
    });
    await expect(executeCanonicalVaultPrimaryAuthoritativeAdvance(test.dependencies)).rejects.toThrow(
      'not eligible',
    );
    expect(test.dependencies.writeJournalVerified).not.toHaveBeenCalled();
  });

  it('rejects a modified verified-write result', async () => {
    const test = harness();
    vi.mocked(test.dependencies.writeJournalVerified).mockImplementationOnce(async (next) => ({
      ...next,
      candidateCreatedAt: '2026-08-09T02:01:00.000Z',
    }));
    await expect(executeCanonicalVaultPrimaryAuthoritativeAdvance(test.dependencies)).rejects.toThrow(
      'failed verified storage',
    );
  });

  it('rejects when fresh state cannot prove safe candidate removal', async () => {
    const test = harness();
    vi.mocked(test.dependencies.readSnapshot)
      .mockResolvedValueOnce(snapshot(primaryWritten))
      .mockResolvedValueOnce(snapshot(primaryWritten));
    await expect(executeCanonicalVaultPrimaryAuthoritativeAdvance(test.dependencies)).rejects.toThrow(
      'fresh snapshot verification',
    );
  });
});
