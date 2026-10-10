import { describe, expect, it } from 'vitest';

import type { CanonicalVaultMigrationJournal } from './canonical-vault-migration-journal-core';
import { isCanonicalVaultMigrationJournal } from './canonical-vault-migration-journal-core';
import { planCanonicalVaultMigration, type CanonicalVaultMigrationSnapshot } from './canonical-vault-migration-policy';
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
  derivationPath: "m/44'/60'/0'/0/0",
  format: 'aurionxi-wallet-identity-v1',
  publicAddress: candidate.publicAddress,
  vaultCreatedAt: candidate.createdAt,
};
const journal: CanonicalVaultMigrationJournal = {
  candidateCreatedAt: candidate.createdAt,
  candidatePublicAddress: candidate.publicAddress,
  createdAt: '2026-08-09T01:00:00.000Z',
  format: 'aurionxi-canonical-vault-migration-v1',
  phase: 'intent-recorded',
  replacementTransactionId: transactionId,
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

describe('canonical active vault migration foundation', () => {
  it('accepts only the strict journal schema', () => {
    expect(isCanonicalVaultMigrationJournal(journal)).toBe(true);
    expect(isCanonicalVaultMigrationJournal({ ...journal, payloadCiphertext: 'forbidden' })).toBe(false);
    expect(isCanonicalVaultMigrationJournal({ ...journal, phase: 'unknown' })).toBe(false);
  });

  it('starts only from finalized candidate authority with an empty primary', () => {
    expect(planCanonicalVaultMigration(snapshot())).toEqual({ action: 'record-intent', state: 'eligible' });
    expect(planCanonicalVaultMigration(snapshot({ primary: candidate }))).toEqual({ action: 'fail-closed', state: 'inconsistent' });
    expect(planCanonicalVaultMigration(snapshot({ cleanupJournal: { ...snapshot().cleanupJournal!, phase: 'primary-removed' } }))).toEqual({ action: 'fail-closed', state: 'inconsistent' });
  });

  it.each([
    ['intent-recorded', candidate, null, 'candidate', 'write-primary-copy', 'intent-recorded'],
    ['intent-recorded', candidate, candidate, 'candidate', 'mark-primary-written', 'primary-copy-present'],
    ['primary-written', candidate, candidate, 'candidate', 'activate-primary-pointer', 'primary-written'],
    ['primary-written', candidate, candidate, 'primary', 'mark-primary-authoritative', 'primary-pointer-active'],
    ['primary-authoritative', candidate, candidate, 'primary', 'remove-candidate', 'primary-authoritative'],
    ['primary-authoritative', null, candidate, 'primary', 'mark-candidate-removed', 'candidate-absent'],
    ['candidate-removed', null, candidate, 'primary', 'mark-finalized', 'candidate-removed'],
    ['finalized', null, candidate, 'primary', 'complete', 'finalized'],
  ] as const)('plans one durable step from %s', (phase, candidateValue, primaryValue, slot, action, state) => {
    expect(planCanonicalVaultMigration(snapshot({
      activeSlot: slot === 'candidate'
        ? { activeSlot: 'candidate', format: 'aurionxi-vault-active-slot-v1', transactionId }
        : { activeSlot: 'primary', format: 'aurionxi-vault-active-slot-v1' },
      candidate: candidateValue,
      migrationJournal: { ...journal, phase },
      primary: primaryValue,
    }))).toEqual({ action, state });
  });

  it('fails closed on a different primary copy before pointer activation', () => {
    expect(planCanonicalVaultMigration(snapshot({
      migrationJournal: { ...journal, phase: 'primary-written' },
      primary: { ...candidate, payloadCiphertext: 'Z'.repeat(40) },
    }))).toEqual({ action: 'fail-closed', state: 'inconsistent' });
  });

  it('never removes the candidate before primary authority is durable', () => {
    for (const phase of ['intent-recorded', 'primary-written'] as const) {
      expect(planCanonicalVaultMigration(snapshot({
        migrationJournal: { ...journal, phase },
        primary: candidate,
      })).action).not.toBe('remove-candidate');
    }
  });
});
