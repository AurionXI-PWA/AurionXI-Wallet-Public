import { describe, expect, it, vi } from 'vitest';

import type { CanonicalVaultMigrationJournal } from './canonical-vault-migration-journal-core';
import type { CanonicalVaultMigrationSnapshot } from './canonical-vault-migration-policy';
import {
  executeCanonicalVaultPrimaryCopy,
  type CanonicalVaultPrimaryCopyExecutorDependencies,
} from './canonical-vault-primary-copy-executor-core';
import type { VaultV3Envelope } from './vault-envelope-v3';
import type { WalletIdentityRecord } from './wallet-identity-record-core';

const transactionId = 'a'.repeat(32);
const candidate: VaultV3Envelope = {
  biometric: {
    keyId: 'c'.repeat(32),
    scheme: 'aes-256-gcm+secure-store-v1',
    wrappedVaultKey: 'C'.repeat(40),
  },
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
const migrationJournal: CanonicalVaultMigrationJournal = {
  candidateCreatedAt: candidate.createdAt,
  candidatePublicAddress: candidate.publicAddress,
  createdAt: '2026-08-09T02:00:00.000Z',
  format: 'aurionxi-canonical-vault-migration-v1',
  phase: 'intent-recorded',
  replacementTransactionId: transactionId,
};

function snapshot(primary: VaultV3Envelope | null): CanonicalVaultMigrationSnapshot {
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
    migrationJournal,
    primary,
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

function harness() {
  let primary: VaultV3Envelope | null = null;
  const dependencies: CanonicalVaultPrimaryCopyExecutorDependencies = {
    readSnapshot: vi.fn().mockImplementation(async () => snapshot(primary)),
    writePrimary: vi.fn().mockImplementation(async (vault) => { primary = vault; }),
  };
  return { dependencies, getPrimary: () => primary };
}

describe('canonical primary copy executor foundation', () => {
  it('copies the complete encrypted candidate and verifies the next exact plan', async () => {
    const test = harness();
    await expect(executeCanonicalVaultPrimaryCopy(test.dependencies)).resolves.toEqual({
      action: 'primary-copy-written',
    });
    expect(test.dependencies.writePrimary).toHaveBeenCalledTimes(1);
    expect(test.dependencies.writePrimary).toHaveBeenCalledWith(candidate);
    expect(test.dependencies.readSnapshot).toHaveBeenCalledTimes(2);
    expect(test.getPrimary()).toEqual(candidate);
  });

  it('exposes no pointer, journal, candidate-write, or delete dependency', () => {
    expect(Object.keys(harness().dependencies).sort()).toEqual(['readSnapshot', 'writePrimary']);
  });

  it('does not write when intent state is absent or inconsistent', async () => {
    const test = harness();
    vi.mocked(test.dependencies.readSnapshot).mockResolvedValueOnce({
      ...snapshot(null),
      migrationJournal: null,
    });
    await expect(executeCanonicalVaultPrimaryCopy(test.dependencies)).rejects.toThrow('not eligible');
    expect(test.dependencies.writePrimary).not.toHaveBeenCalled();
  });

  it('fails when stored primary differs in any encrypted field', async () => {
    const test = harness();
    vi.mocked(test.dependencies.writePrimary).mockImplementationOnce(async () => undefined);
    vi.mocked(test.dependencies.readSnapshot)
      .mockResolvedValueOnce(snapshot(null))
      .mockResolvedValueOnce(snapshot({ ...candidate, payloadCiphertext: 'Z'.repeat(40) }));
    await expect(executeCanonicalVaultPrimaryCopy(test.dependencies)).rejects.toThrow(
      'exact fresh snapshot verification',
    );
  });

  it('fails if the active pointer changes during copy verification', async () => {
    const test = harness();
    vi.mocked(test.dependencies.readSnapshot)
      .mockResolvedValueOnce(snapshot(null))
      .mockResolvedValueOnce({
        ...snapshot(candidate),
        activeSlot: { activeSlot: 'primary', format: 'aurionxi-vault-active-slot-v1' },
      });
    await expect(executeCanonicalVaultPrimaryCopy(test.dependencies)).rejects.toThrow(
      'exact fresh snapshot verification',
    );
  });
});
