import { describe, expect, it, vi } from 'vitest';

import type { CanonicalVaultMigrationJournal } from './canonical-vault-migration-journal-core';
import type { CanonicalVaultMigrationSnapshot } from './canonical-vault-migration-policy';
import {
  executeCanonicalVaultPrimaryPointerActivation,
  type CanonicalVaultPrimaryPointerExecutorDependencies,
} from './canonical-vault-primary-pointer-executor-core';
import type { VaultActiveSlotRecord } from './vault-active-slot-core';
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
const migrationJournal: CanonicalVaultMigrationJournal = {
  candidateCreatedAt: vault.createdAt,
  candidatePublicAddress: vault.publicAddress,
  createdAt: '2026-08-09T02:00:00.000Z',
  format: 'aurionxi-canonical-vault-migration-v1',
  phase: 'primary-written',
  replacementTransactionId: transactionId,
};

function snapshot(activeSlot: VaultActiveSlotRecord): CanonicalVaultMigrationSnapshot {
  return {
    activeSlot,
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

const candidateSlot: VaultActiveSlotRecord = {
  activeSlot: 'candidate',
  format: 'aurionxi-vault-active-slot-v1',
  transactionId,
};
const primarySlot: VaultActiveSlotRecord = {
  activeSlot: 'primary',
  format: 'aurionxi-vault-active-slot-v1',
};

function harness() {
  let activeSlot = candidateSlot;
  const dependencies: CanonicalVaultPrimaryPointerExecutorDependencies = {
    readSnapshot: vi.fn().mockImplementation(async () => snapshot(activeSlot)),
    writeActiveSlot: vi.fn().mockImplementation(async (record) => { activeSlot = record; }),
  };
  return { dependencies, getActiveSlot: () => activeSlot };
}

describe('canonical primary pointer activation foundation', () => {
  it('writes the strict primary pointer and verifies primary authority is next', async () => {
    const test = harness();
    await expect(executeCanonicalVaultPrimaryPointerActivation(test.dependencies)).resolves.toEqual({
      action: 'primary-pointer-activated',
    });
    expect(test.dependencies.writeActiveSlot).toHaveBeenCalledWith(primarySlot);
    expect(test.dependencies.writeActiveSlot).toHaveBeenCalledTimes(1);
    expect(test.dependencies.readSnapshot).toHaveBeenCalledTimes(2);
    expect(test.getActiveSlot()).toEqual(primarySlot);
  });

  it('exposes no vault, journal, candidate, or delete mutation dependency', () => {
    expect(Object.keys(harness().dependencies).sort()).toEqual([
      'readSnapshot',
      'writeActiveSlot',
    ]);
  });

  it('does not write unless primary-written is durably verified', async () => {
    const test = harness();
    vi.mocked(test.dependencies.readSnapshot).mockResolvedValueOnce({
      ...snapshot(candidateSlot),
      migrationJournal: { ...migrationJournal, phase: 'intent-recorded' },
    });
    await expect(executeCanonicalVaultPrimaryPointerActivation(test.dependencies)).rejects.toThrow(
      'not eligible',
    );
    expect(test.dependencies.writeActiveSlot).not.toHaveBeenCalled();
  });

  it('fails if pointer read-back remains candidate', async () => {
    const test = harness();
    vi.mocked(test.dependencies.writeActiveSlot).mockResolvedValueOnce(undefined);
    await expect(executeCanonicalVaultPrimaryPointerActivation(test.dependencies)).rejects.toThrow(
      'fresh snapshot verification',
    );
  });

  it('fails if primary or candidate equality is lost after pointer write', async () => {
    const test = harness();
    vi.mocked(test.dependencies.readSnapshot)
      .mockResolvedValueOnce(snapshot(candidateSlot))
      .mockResolvedValueOnce({
        ...snapshot(primarySlot),
        primary: { ...vault, payloadCiphertext: 'Z'.repeat(40) },
      });
    await expect(executeCanonicalVaultPrimaryPointerActivation(test.dependencies)).rejects.toThrow(
      'fresh snapshot verification',
    );
  });
});
