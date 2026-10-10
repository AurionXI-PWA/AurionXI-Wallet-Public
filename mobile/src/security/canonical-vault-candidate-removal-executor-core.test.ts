import { describe, expect, it, vi } from 'vitest';

import type { CanonicalVaultMigrationJournal } from './canonical-vault-migration-journal-core';
import type { CanonicalVaultMigrationSnapshot } from './canonical-vault-migration-policy';
import {
  executeVerifiedCanonicalVaultCandidateRemoval,
  type CanonicalVaultCandidateRemovalExecutorDependencies,
} from './canonical-vault-candidate-removal-executor-core';
import type { VaultV3Envelope } from './vault-envelope-v3';
import type { WalletIdentityRecord } from './wallet-identity-record-core';

const transactionId = 'a'.repeat(32);
const vault: VaultV3Envelope = {
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
  publicAddress: vault.publicAddress,
  vaultCreatedAt: vault.createdAt,
};
const migrationJournal: CanonicalVaultMigrationJournal = {
  candidateCreatedAt: vault.createdAt,
  candidatePublicAddress: vault.publicAddress,
  createdAt: '2026-08-09T02:00:00.000Z',
  format: 'aurionxi-canonical-vault-migration-v1',
  phase: 'primary-authoritative',
  replacementTransactionId: transactionId,
};

function snapshot(candidate: VaultV3Envelope | null): CanonicalVaultMigrationSnapshot {
  return {
    activeSlot: { activeSlot: 'primary', format: 'aurionxi-vault-active-slot-v1' },
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
  let candidate: VaultV3Envelope | null = vault;
  const dependencies: CanonicalVaultCandidateRemovalExecutorDependencies = {
    deleteCandidate: vi.fn().mockImplementation(async () => { candidate = null; }),
    readSnapshot: vi.fn().mockImplementation(async () => snapshot(candidate)),
  };
  return { dependencies, getCandidate: () => candidate };
}

describe('verified canonical candidate removal foundation', () => {
  it('removes only the candidate after durable primary authority and verifies empty read-back', async () => {
    const test = harness();
    await expect(executeVerifiedCanonicalVaultCandidateRemoval(test.dependencies)).resolves.toEqual({
      action: 'candidate-removed',
    });
    expect(test.dependencies.deleteCandidate).toHaveBeenCalledTimes(1);
    expect(test.dependencies.readSnapshot).toHaveBeenCalledTimes(2);
    expect(test.getCandidate()).toBeNull();
  });

  it('exposes exactly one narrowly scoped delete dependency', () => {
    expect(Object.keys(harness().dependencies).sort()).toEqual([
      'deleteCandidate',
      'readSnapshot',
    ]);
  });

  it.each([
    {
      activeSlot: { activeSlot: 'candidate', format: 'aurionxi-vault-active-slot-v1', transactionId } as const,
    },
    { primary: null },
    { migrationJournal: { ...migrationJournal, phase: 'primary-written' as const } },
    { candidate: null },
  ])('does not delete for an ineligible authority snapshot', async (override) => {
    const test = harness();
    vi.mocked(test.dependencies.readSnapshot).mockResolvedValueOnce({ ...snapshot(vault), ...override });
    await expect(executeVerifiedCanonicalVaultCandidateRemoval(test.dependencies)).rejects.toThrow(
      'not eligible',
    );
    expect(test.dependencies.deleteCandidate).not.toHaveBeenCalled();
  });

  it('fails if deletion returns but candidate is still present', async () => {
    const test = harness();
    vi.mocked(test.dependencies.deleteCandidate).mockResolvedValueOnce(undefined);
    await expect(executeVerifiedCanonicalVaultCandidateRemoval(test.dependencies)).rejects.toThrow(
      'empty and authority read-back verification',
    );
  });

  it('fails if primary authority changes after candidate deletion', async () => {
    const test = harness();
    vi.mocked(test.dependencies.readSnapshot)
      .mockResolvedValueOnce(snapshot(vault))
      .mockResolvedValueOnce({
        ...snapshot(null),
        activeSlot: { activeSlot: 'candidate', format: 'aurionxi-vault-active-slot-v1', transactionId },
      });
    await expect(executeVerifiedCanonicalVaultCandidateRemoval(test.dependencies)).rejects.toThrow(
      'empty and authority read-back verification',
    );
  });
});
