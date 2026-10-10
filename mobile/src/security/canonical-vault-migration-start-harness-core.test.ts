import { describe, expect, it, vi } from 'vitest';

import type { CanonicalVaultMigrationSnapshot } from './canonical-vault-migration-policy';
import { CanonicalVaultMigrationStartHarness } from './canonical-vault-migration-start-harness-core';

const ADDRESS = `0x${'12'.repeat(20)}` as const;
const PREVIOUS_ADDRESS = `0x${'34'.repeat(20)}` as const;
const TRANSACTION_ID = 'a'.repeat(32);

function eligibleSnapshot(): CanonicalVaultMigrationSnapshot {
  const identity = {
    derivationPath: "m/44'/60'/0'/0/0" as const,
    format: 'aurionxi-wallet-identity-v1' as const,
    publicAddress: ADDRESS,
    vaultCreatedAt: '2026-08-01T00:00:00.000Z',
  };
  const previousIdentity = {
    ...identity,
    publicAddress: PREVIOUS_ADDRESS,
    vaultCreatedAt: '2026-07-01T00:00:00.000Z',
  };
  const candidate = {
    createdAt: identity.vaultCreatedAt,
    format: 'aurionxi-vault-v3' as const,
    payloadCiphertext: 'ciphertext',
    pin: {
      algorithm: 'argon2id' as const,
      saltHex: 'ab'.repeat(16),
      wrappedVaultKey: 'wrapped-key',
    },
    publicAddress: ADDRESS,
  };
  return {
    activeSlot: {
      activeSlot: 'candidate',
      format: 'aurionxi-vault-active-slot-v1',
      transactionId: TRANSACTION_ID,
    },
    candidate,
    cleanupJournal: {
      activeIdentity: identity,
      createdAt: '2026-08-01T00:00:01.000Z',
      format: 'aurionxi-retired-primary-cleanup-v1',
      phase: 'finalized',
      replacementTransactionId: TRANSACTION_ID,
      retiredIdentity: previousIdentity,
      retiredPrimaryStatus: 'present',
    },
    currentIdentity: identity,
    identityTransitionJournal: {
      createdAt: '2026-08-01T00:00:01.000Z',
      format: 'aurionxi-wallet-identity-transition-v1',
      nextIdentity: identity,
      phase: 'identity-verified',
      previousIdentity,
      replacementTransactionId: TRANSACTION_ID,
    },
    migrationJournal: null,
    primary: null,
    replacementJournal: {
      candidatePublicAddress: ADDRESS,
      createdAt: '2026-08-01T00:00:01.000Z',
      format: 'aurionxi-vault-replacement-journal-v1',
      phase: 'cleanup-pending',
      targetStatus: 'present',
      transactionId: TRANSACTION_ID,
    },
  };
}

describe('canonical migration unmounted screen harness foundation', () => {
  it('begins an eligible snapshot at the local PIN screen', () => {
    const harness = new CanonicalVaultMigrationStartHarness({ authenticatePin: vi.fn() });
    expect(harness.begin(eligibleSnapshot()).screen.title).toBe('Verify wallet access');
  });

  it('uses the injected PIN stub and never retains the submitted PIN', async () => {
    const authenticatePin = vi.fn().mockResolvedValue(undefined);
    const harness = new CanonicalVaultMigrationStartHarness({ authenticatePin });
    harness.begin(eligibleSnapshot());
    await harness.handle({ pin: '123456', type: 'VERIFY_PIN_REQUESTED' }, 1_000);
    expect(authenticatePin).toHaveBeenCalledWith('123456', expect.any(AbortSignal));
    expect(harness.getState().screen.title).toBe('Confirm storage optimization');
    expect(JSON.stringify(harness)).not.toContain('123456');
    expect(JSON.stringify(harness.getState())).not.toContain('123456');
  });

  it('moves exact local confirmation to authorized without retaining the phrase', async () => {
    const harness = new CanonicalVaultMigrationStartHarness({ authenticatePin: vi.fn() });
    harness.begin(eligibleSnapshot());
    await harness.handle({ pin: '123456', type: 'VERIFY_PIN_REQUESTED' }, 1_000);
    await harness.handle({ confirmation: 'OPTIMIZE WALLET STORAGE', type: 'CONFIRM_AUTHORIZATION_REQUESTED' }, 1_001);
    expect(harness.getState().screen.title).toBe('Optimization authorized');
    expect(JSON.stringify(harness.getState())).not.toContain('OPTIMIZE WALLET STORAGE');
  });

  it('reports an authorized start without executing or navigating', async () => {
    const harness = new CanonicalVaultMigrationStartHarness({ authenticatePin: vi.fn() });
    harness.begin(eligibleSnapshot());
    await harness.handle({ pin: '123456', type: 'VERIFY_PIN_REQUESTED' }, 1_000);
    await harness.handle({ confirmation: 'OPTIMIZE WALLET STORAGE', type: 'CONFIRM_AUTHORIZATION_REQUESTED' }, 1_001);
    await expect(harness.handle({ type: 'AUTHORIZED_START_REQUESTED' }, 1_002))
      .resolves.toMatchObject({ action: 'authorized-start-reported' });
    expect(harness.getAuthorizedStartReportCount()).toBe(1);
    expect(harness.getState()).not.toHaveProperty('route');
    expect(harness.getState()).not.toHaveProperty('executeIntent');
  });

  it('keeps only a generic error when the PIN stub rejects', async () => {
    const harness = new CanonicalVaultMigrationStartHarness({
      authenticatePin: vi.fn().mockRejectedValue(new Error('secret verifier detail')),
    });
    harness.begin(eligibleSnapshot());
    await expect(harness.handle({ pin: '000000', type: 'VERIFY_PIN_REQUESTED' }, 1_000)).rejects.toThrow();
    expect(harness.getState().error).toBe('PIN verification did not complete.');
    expect(JSON.stringify(harness.getState())).not.toContain('000000');
    expect(JSON.stringify(harness.getState())).not.toContain('secret verifier detail');
  });

  it('releases the controller dependency idempotently and rejects later events', async () => {
    const harness = new CanonicalVaultMigrationStartHarness({ authenticatePin: vi.fn() });
    harness.begin(eligibleSnapshot());
    harness.release();
    harness.release();
    expect(harness.getState().screen.title).toBe('Wallet storage optimization');
    await expect(harness.handle({ type: 'AUTHORIZED_START_REQUESTED' }))
      .rejects.toThrow('released');
  });
});
