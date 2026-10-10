import { describe, expect, it } from 'vitest';

import type { CanonicalVaultMigrationSnapshot } from './canonical-vault-migration-policy';
import {
  CANONICAL_VAULT_MIGRATION_START_AUTHORIZATION_MS,
  CANONICAL_VAULT_MIGRATION_START_CONFIRMATION,
  canStartCanonicalVaultMigration,
  INITIAL_CANONICAL_VAULT_MIGRATION_START_AUTHORIZATION,
  transitionCanonicalVaultMigrationStartAuthorization,
  type CanonicalVaultMigrationStartAuthorizationEvent,
} from './canonical-vault-migration-start-authorization';
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

function snapshot(overrides: Partial<CanonicalVaultMigrationSnapshot> = {}): CanonicalVaultMigrationSnapshot {
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
    ...overrides,
  };
}

function run(events: CanonicalVaultMigrationStartAuthorizationEvent[]) {
  return events.reduce(
    transitionCanonicalVaultMigrationStartAuthorization,
    INITIAL_CANONICAL_VAULT_MIGRATION_START_AUTHORIZATION,
  );
}

describe('explicit canonical migration start authorization foundation', () => {
  it('requires eligible scope, PIN verification, and the exact English confirmation', () => {
    const authorized = run([
      { snapshot: snapshot(), type: 'BEGIN' },
      { now: 100, type: 'PIN_VERIFIED' },
      { confirmation: CANONICAL_VAULT_MIGRATION_START_CONFIRMATION, now: 101, type: 'CONFIRM' },
    ]);
    expect(authorized.stage).toBe('authorized');
    expect(canStartCanonicalVaultMigration(authorized, snapshot(), 101)).toBe(true);
  });

  it('blocks begin when fresh migration intent is not exactly eligible', () => {
    expect(run([{ snapshot: snapshot({ primary: candidate }), type: 'BEGIN' }])).toEqual({ stage: 'blocked' });
    expect(run([{
      snapshot: snapshot({ cleanupJournal: { ...snapshot().cleanupJournal!, phase: 'primary-removed' } }),
      type: 'BEGIN',
    }])).toEqual({ stage: 'blocked' });
  });

  it('requires exact case-sensitive confirmation after PIN verification', () => {
    const state = run([
      { snapshot: snapshot(), type: 'BEGIN' },
      { now: 100, type: 'PIN_VERIFIED' },
      { confirmation: 'optimize wallet storage', now: 101, type: 'CONFIRM' },
    ]);
    expect(state.stage).toBe('awaiting-confirmation');
    expect(canStartCanonicalVaultMigration(state, snapshot(), 101)).toBe(false);
  });

  it('expires at the exact boundary and reset removes authority', () => {
    const authorized = run([
      { snapshot: snapshot(), type: 'BEGIN' },
      { now: 100, type: 'PIN_VERIFIED' },
      { confirmation: CANONICAL_VAULT_MIGRATION_START_CONFIRMATION, now: 101, type: 'CONFIRM' },
    ]);
    expect(canStartCanonicalVaultMigration(
      authorized,
      snapshot(),
      100 + CANONICAL_VAULT_MIGRATION_START_AUTHORIZATION_MS - 1,
    )).toBe(true);
    expect(canStartCanonicalVaultMigration(
      authorized,
      snapshot(),
      100 + CANONICAL_VAULT_MIGRATION_START_AUTHORIZATION_MS,
    )).toBe(false);
    expect(transitionCanonicalVaultMigrationStartAuthorization(authorized, {
      now: 100 + CANONICAL_VAULT_MIGRATION_START_AUTHORIZATION_MS,
      type: 'CHECK_EXPIRY',
    })).toEqual(INITIAL_CANONICAL_VAULT_MIGRATION_START_AUTHORIZATION);
    expect(transitionCanonicalVaultMigrationStartAuthorization(authorized, { type: 'RESET' }))
      .toEqual(INITIAL_CANONICAL_VAULT_MIGRATION_START_AUTHORIZATION);
  });

  it('rejects changed candidate identity, creation time, transaction, or eligibility', () => {
    const authorized = run([
      { snapshot: snapshot(), type: 'BEGIN' },
      { now: 100, type: 'PIN_VERIFIED' },
      { confirmation: CANONICAL_VAULT_MIGRATION_START_CONFIRMATION, now: 101, type: 'CONFIRM' },
    ]);
    expect(canStartCanonicalVaultMigration(authorized, snapshot({
      candidate: { ...candidate, publicAddress: '0x3333333333333333333333333333333333333333' },
    }), 101)).toBe(false);
    expect(canStartCanonicalVaultMigration(authorized, snapshot({
      candidate: { ...candidate, createdAt: '2026-08-09T00:01:00.000Z' },
    }), 101)).toBe(false);
    expect(canStartCanonicalVaultMigration(authorized, snapshot({
      replacementJournal: { ...snapshot().replacementJournal!, transactionId: 'd'.repeat(32) },
    }), 101)).toBe(false);
    expect(canStartCanonicalVaultMigration(authorized, snapshot({ primary: candidate }), 101)).toBe(false);
  });

  it('stores no PIN, confirmation text, wallet secret, or encrypted payload', () => {
    const state = run([
      { snapshot: snapshot(), type: 'BEGIN' },
      { now: 100, type: 'PIN_VERIFIED' },
    ]);
    expect(state).not.toHaveProperty('pin');
    expect(state).not.toHaveProperty('confirmation');
    expect(JSON.stringify(state)).not.toContain(CANONICAL_VAULT_MIGRATION_START_CONFIRMATION);
    expect(JSON.stringify(state)).not.toMatch(/mnemonic|recovery phrase|payload|ciphertext|private key/i);
  });
});
