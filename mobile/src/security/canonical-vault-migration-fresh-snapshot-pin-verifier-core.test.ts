import { describe, expect, it, vi } from 'vitest';

import { createFreshSnapshotCanonicalVaultMigrationPinVerifier } from './canonical-vault-migration-fresh-snapshot-pin-verifier-core';
import type { CanonicalVaultMigrationSnapshot } from './canonical-vault-migration-policy';

const snapshot = {
  activeSlot: { activeSlot: 'candidate', format: 'aurionxi-vault-active-slot-v1', transactionId: 'a'.repeat(32) },
  candidate: {
    createdAt: '2026-08-09T00:00:00.000Z',
    format: 'aurionxi-vault-v3',
    payloadCiphertext: 'A'.repeat(40),
    pin: { algorithm: 'argon2id', saltHex: 'b'.repeat(32), wrappedVaultKey: 'B'.repeat(40) },
    publicAddress: '0x2222222222222222222222222222222222222222',
  },
  cleanupJournal: null,
  currentIdentity: null,
  identityTransitionJournal: null,
  migrationJournal: null,
  primary: null,
  replacementJournal: {
    candidatePublicAddress: '0x2222222222222222222222222222222222222222',
    createdAt: '2026-08-09T00:00:00.000Z',
    format: 'aurionxi-vault-replacement-journal-v1',
    phase: 'cleanup-pending',
    targetStatus: 'present',
    transactionId: 'a'.repeat(32),
  },
} satisfies CanonicalVaultMigrationSnapshot;

describe('canonical migration loaded snapshot freshness recheck foundation', () => {
  it('calls the PIN verifier only after the same fresh scope is loaded', async () => {
    const authenticatePin = vi.fn().mockResolvedValue(undefined);
    const loadEligibleSnapshot = vi.fn().mockResolvedValue(snapshot);
    const verifier = createFreshSnapshotCanonicalVaultMigrationPinVerifier(
      snapshot,
      loadEligibleSnapshot,
      authenticatePin,
    );
    const abortController = new AbortController();
    await verifier('123456', abortController.signal);
    expect(loadEligibleSnapshot).toHaveBeenCalledTimes(2);
    expect(authenticatePin).toHaveBeenCalledWith('123456', abortController.signal);
  });

  it('rejects a different candidate scope before PIN verification', async () => {
    const authenticatePin = vi.fn();
    const fresh = {
      ...snapshot,
      candidate: { ...snapshot.candidate!, createdAt: '2026-08-09T00:00:01.000Z' },
    };
    const verifier = createFreshSnapshotCanonicalVaultMigrationPinVerifier(
      snapshot,
      vi.fn().mockResolvedValue(fresh),
      authenticatePin,
    );
    await expect(verifier('123456', new AbortController().signal)).rejects.toThrow('eligibility changed');
    expect(authenticatePin).not.toHaveBeenCalled();
  });

  it('does not call PIN verification when fresh eligibility loading fails', async () => {
    const authenticatePin = vi.fn();
    const verifier = createFreshSnapshotCanonicalVaultMigrationPinVerifier(
      snapshot,
      vi.fn().mockRejectedValue(new Error('not currently eligible')),
      authenticatePin,
    );
    await expect(verifier('123456', new AbortController().signal)).rejects.toThrow('not currently eligible');
    expect(authenticatePin).not.toHaveBeenCalled();
  });

  it('does not load or authenticate when already aborted', async () => {
    const loadEligibleSnapshot = vi.fn();
    const authenticatePin = vi.fn();
    const verifier = createFreshSnapshotCanonicalVaultMigrationPinVerifier(
      snapshot,
      loadEligibleSnapshot,
      authenticatePin,
    );
    const abortController = new AbortController();
    abortController.abort();
    await expect(verifier('123456', abortController.signal)).rejects.toThrow('cancelled');
    expect(loadEligibleSnapshot).not.toHaveBeenCalled();
    expect(authenticatePin).not.toHaveBeenCalled();
  });

  it('does not authenticate if aborted while the fresh read is pending', async () => {
    let resolveFresh: ((value: CanonicalVaultMigrationSnapshot) => void) | undefined;
    const loadEligibleSnapshot = vi.fn(() => new Promise<CanonicalVaultMigrationSnapshot>((resolve) => {
      resolveFresh = resolve;
    }));
    const authenticatePin = vi.fn();
    const verifier = createFreshSnapshotCanonicalVaultMigrationPinVerifier(
      snapshot,
      loadEligibleSnapshot,
      authenticatePin,
    );
    const abortController = new AbortController();
    const pending = verifier('123456', abortController.signal);
    abortController.abort();
    resolveFresh?.(snapshot);
    await expect(pending).rejects.toThrow('cancelled');
    expect(authenticatePin).not.toHaveBeenCalled();
  });

  it('rejects a scope change that occurs during PIN verification', async () => {
    const postPinSnapshot = {
      ...snapshot,
      replacementJournal: {
        ...snapshot.replacementJournal!,
        transactionId: 'c'.repeat(32),
      },
    };
    const loadEligibleSnapshot = vi.fn()
      .mockResolvedValueOnce(snapshot)
      .mockResolvedValueOnce(postPinSnapshot);
    const authenticatePin = vi.fn().mockResolvedValue(undefined);
    const verifier = createFreshSnapshotCanonicalVaultMigrationPinVerifier(
      snapshot,
      loadEligibleSnapshot,
      authenticatePin,
    );
    await expect(verifier('123456', new AbortController().signal))
      .rejects.toThrow('changed after PIN verification');
    expect(authenticatePin).toHaveBeenCalledOnce();
    expect(loadEligibleSnapshot).toHaveBeenCalledTimes(2);
  });

  it('rejects post-PIN eligibility read failure after one verifier call', async () => {
    const loadEligibleSnapshot = vi.fn()
      .mockResolvedValueOnce(snapshot)
      .mockRejectedValueOnce(new Error('post-PIN read failed'));
    const authenticatePin = vi.fn().mockResolvedValue(undefined);
    const verifier = createFreshSnapshotCanonicalVaultMigrationPinVerifier(
      snapshot,
      loadEligibleSnapshot,
      authenticatePin,
    );
    await expect(verifier('123456', new AbortController().signal))
      .rejects.toThrow('post-PIN read failed');
    expect(authenticatePin).toHaveBeenCalledOnce();
  });

  it('does not perform the post-PIN read when verification is aborted', async () => {
    const abortController = new AbortController();
    const loadEligibleSnapshot = vi.fn().mockResolvedValue(snapshot);
    const authenticatePin = vi.fn().mockImplementation(async () => {
      abortController.abort();
    });
    const verifier = createFreshSnapshotCanonicalVaultMigrationPinVerifier(
      snapshot,
      loadEligibleSnapshot,
      authenticatePin,
    );
    await expect(verifier('123456', abortController.signal)).rejects.toThrow('cancelled');
    expect(loadEligibleSnapshot).toHaveBeenCalledOnce();
  });
});
