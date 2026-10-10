import { describe, expect, it, vi } from 'vitest';

import type { CanonicalVaultMigrationJournal } from './canonical-vault-migration-journal-core';
import type { CanonicalVaultMigrationSnapshot } from './canonical-vault-migration-policy';
import {
  CANONICAL_VAULT_MIGRATION_START_CONFIRMATION,
  INITIAL_CANONICAL_VAULT_MIGRATION_START_AUTHORIZATION,
  transitionCanonicalVaultMigrationStartAuthorization,
  type CanonicalVaultMigrationStartAuthorization,
} from './canonical-vault-migration-start-authorization';
import {
  executeAuthorizedCanonicalVaultMigrationIntent,
  type CanonicalVaultAuthorizedIntentExecutorDependencies,
} from './canonical-vault-authorized-intent-executor-core';
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

function snapshot(migrationJournal: CanonicalVaultMigrationJournal | null = null): CanonicalVaultMigrationSnapshot {
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

function authorization(): CanonicalVaultMigrationStartAuthorization {
  const awaitingPin = transitionCanonicalVaultMigrationStartAuthorization(
    INITIAL_CANONICAL_VAULT_MIGRATION_START_AUTHORIZATION,
    { snapshot: snapshot(), type: 'BEGIN' },
  );
  const awaitingConfirmation = transitionCanonicalVaultMigrationStartAuthorization(awaitingPin, {
    now: 1_000,
    type: 'PIN_VERIFIED',
  });
  return transitionCanonicalVaultMigrationStartAuthorization(awaitingConfirmation, {
    confirmation: CANONICAL_VAULT_MIGRATION_START_CONFIRMATION,
    now: 1_001,
    type: 'CONFIRM',
  });
}

function harness() {
  let journal: CanonicalVaultMigrationJournal | null = null;
  const dependencies: CanonicalVaultAuthorizedIntentExecutorDependencies = {
    readSnapshot: vi.fn().mockImplementation(async () => snapshot(journal)),
    writeJournalVerified: vi.fn().mockImplementation(async (next) => {
      journal = next;
      return next;
    }),
  };
  return { dependencies, getJournal: () => journal };
}

describe('authorized canonical intent executor binding foundation', () => {
  it('records intent only after fresh authorization and independent executor verification', async () => {
    const test = harness();
    await expect(executeAuthorizedCanonicalVaultMigrationIntent(
      authorization(),
      '2026-08-09T03:00:00.000Z',
      1_001,
      test.dependencies,
    )).resolves.toEqual({ action: 'intent-recorded' });
    expect(test.dependencies.writeJournalVerified).toHaveBeenCalledTimes(1);
    expect(test.dependencies.readSnapshot).toHaveBeenCalledTimes(3);
    expect(test.getJournal()?.phase).toBe('intent-recorded');
  });

  it.each([
    { stage: 'idle' } as const,
    { ...authorization(), authorizationExpiresAt: 1_001 },
    { ...authorization(), scope: { ...authorization().scope!, replacementTransactionId: 'd'.repeat(32) } },
  ])('does not write for invalid, expired, or stale authorization', async (authority) => {
    const test = harness();
    await expect(executeAuthorizedCanonicalVaultMigrationIntent(
      authority,
      '2026-08-09T03:00:00.000Z',
      1_001,
      test.dependencies,
    )).rejects.toThrow('invalid, expired, or stale');
    expect(test.dependencies.writeJournalVerified).not.toHaveBeenCalled();
    expect(test.dependencies.readSnapshot).toHaveBeenCalledTimes(1);
  });

  it('rejects authorization when fresh eligibility changed before execution', async () => {
    const test = harness();
    vi.mocked(test.dependencies.readSnapshot).mockResolvedValueOnce({ ...snapshot(), primary: candidate });
    await expect(executeAuthorizedCanonicalVaultMigrationIntent(
      authorization(),
      '2026-08-09T03:00:00.000Z',
      1_001,
      test.dependencies,
    )).rejects.toThrow('invalid, expired, or stale');
    expect(test.dependencies.writeJournalVerified).not.toHaveBeenCalled();
  });

  it('still fails closed if eligibility changes after authorization validation', async () => {
    const test = harness();
    vi.mocked(test.dependencies.readSnapshot)
      .mockResolvedValueOnce(snapshot())
      .mockResolvedValueOnce({ ...snapshot(), primary: candidate });
    await expect(executeAuthorizedCanonicalVaultMigrationIntent(
      authorization(),
      '2026-08-09T03:00:00.000Z',
      1_001,
      test.dependencies,
    )).rejects.toThrow('intent is not eligible');
    expect(test.dependencies.writeJournalVerified).not.toHaveBeenCalled();
  });

  it('exposes no vault, pointer, or delete mutation dependency', () => {
    expect(Object.keys(harness().dependencies).sort()).toEqual([
      'readSnapshot',
      'writeJournalVerified',
    ]);
  });
});
