import { describe, expect, it, vi } from 'vitest';

import type { CanonicalVaultMigrationSnapshot } from './canonical-vault-migration-policy';
import {
  CANONICAL_VAULT_MIGRATION_START_AUTHORIZATION_MS,
  CANONICAL_VAULT_MIGRATION_START_CONFIRMATION,
} from './canonical-vault-migration-start-authorization';
import { CanonicalVaultMigrationStartController } from './canonical-vault-migration-start-controller-core';
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

describe('canonical migration start authorization controller foundation', () => {
  it('blocks begin for a fresh ineligible snapshot', () => {
    const controller = new CanonicalVaultMigrationStartController({ authenticatePin: vi.fn() });
    expect(controller.begin({ ...eligibleSnapshot(), primary: candidate })).toEqual({ stage: 'blocked' });
  });

  it('advances only after successful active-wallet PIN authentication and exact confirmation', async () => {
    const authenticatePin = vi.fn().mockResolvedValue(undefined);
    const controller = new CanonicalVaultMigrationStartController({ authenticatePin });
    expect(controller.begin(eligibleSnapshot()).stage).toBe('awaiting-pin');
    await expect(controller.authenticatePin('123456', 1_000)).resolves.toEqual(
      expect.objectContaining({ stage: 'awaiting-confirmation' }),
    );
    expect(authenticatePin).toHaveBeenCalledWith('123456', expect.any(AbortSignal));
    expect(controller.confirm(CANONICAL_VAULT_MIGRATION_START_CONFIRMATION, 1_001).stage).toBe('authorized');
  });

  it('does not advance state after failed PIN authentication', async () => {
    const controller = new CanonicalVaultMigrationStartController({
      authenticatePin: vi.fn().mockRejectedValue(new Error('wrong PIN')),
    });
    controller.begin(eligibleSnapshot());
    await expect(controller.authenticatePin('000000', 1_000)).rejects.toThrow('wrong PIN');
    expect(controller.getState().stage).toBe('awaiting-pin');
  });

  it('rejects a concurrent PIN authentication attempt', async () => {
    let release: (() => void) | undefined;
    const authenticatePin = vi.fn(() => new Promise<void>((resolve) => { release = resolve; }));
    const controller = new CanonicalVaultMigrationStartController({ authenticatePin });
    controller.begin(eligibleSnapshot());
    const first = controller.authenticatePin('123456', 1_000);
    await expect(controller.authenticatePin('123456', 1_000)).rejects.toThrow('already active');
    release?.();
    await first;
  });

  it('rejects authentication completion after reset changed authorization', async () => {
    let release: (() => void) | undefined;
    const authenticatePin = vi.fn(() => new Promise<void>((resolve) => { release = resolve; }));
    const controller = new CanonicalVaultMigrationStartController({ authenticatePin });
    controller.begin(eligibleSnapshot());
    const pending = controller.authenticatePin('123456', 1_000);
    controller.reset();
    release?.();
    await expect(pending).rejects.toThrow('cancelled');
    expect(controller.getState()).toEqual({ stage: 'idle' });
  });

  it('settles the app-owned chain when a provider promise never settles', async () => {
    let capturedSignal: AbortSignal | undefined;
    const authenticatePin = vi.fn((_pin: string, signal: AbortSignal) => {
      capturedSignal = signal;
      return new Promise<void>(() => undefined);
    });
    const controller = new CanonicalVaultMigrationStartController({ authenticatePin });
    controller.begin(eligibleSnapshot());
    const pending = controller.authenticatePin('123456', 1_000);
    controller.reset();
    await expect(pending).rejects.toThrow('cancelled');
    expect(capturedSignal?.aborted).toBe(true);
    expect(controller.getState()).toEqual({ stage: 'idle' });
  });

  it('enforces stage ordering and expiry checks', async () => {
    const controller = new CanonicalVaultMigrationStartController({
      authenticatePin: vi.fn().mockResolvedValue(undefined),
    });
    await expect(controller.authenticatePin('123456', 1_000)).rejects.toThrow('not allowed');
    controller.begin(eligibleSnapshot());
    await controller.authenticatePin('123456', 1_000);
    expect(controller.checkExpiry(1_000 + CANONICAL_VAULT_MIGRATION_START_AUTHORIZATION_MS))
      .toEqual({ stage: 'idle' });
  });
});
