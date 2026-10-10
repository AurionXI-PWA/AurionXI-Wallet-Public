import { describe, expect, it } from 'vitest';

import type { VaultV3Envelope } from './vault-envelope-v3';
import { resolveActiveVault, ActiveVaultResolutionError } from './vault-active-resolver-core';
import { createCandidateActiveSlotRecord } from './vault-active-slot-core';
import type { VaultReplacementJournal } from './vault-replacement-journal-core';

const primary = {
  createdAt: '2026-08-09T00:00:00.000Z',
  format: 'aurionxi-vault-v3',
  payloadCiphertext: 'P'.repeat(40),
  pin: { algorithm: 'argon2id', saltHex: '1'.repeat(32), wrappedVaultKey: 'A'.repeat(40) },
  publicAddress: '0x0000000000000000000000000000000000000001',
} satisfies VaultV3Envelope;
const candidate = {
  ...primary,
  payloadCiphertext: 'C'.repeat(40),
  publicAddress: '0x0000000000000000000000000000000000000002',
} satisfies VaultV3Envelope;
const journal: VaultReplacementJournal = {
  candidatePublicAddress: candidate.publicAddress,
  createdAt: '2026-08-09T01:00:00.000Z',
  format: 'aurionxi-vault-replacement-journal-v1',
  phase: 'promotion-started',
  targetStatus: 'present',
  transactionId: 'a'.repeat(32),
};
const candidatePointer = createCandidateActiveSlotRecord(journal.transactionId);

describe('active encrypted vault resolver', () => {
  it('uses the primary vault for a missing legacy pointer', () => {
    expect(resolveActiveVault(null, primary, candidate, journal)).toEqual({ slot: 'primary', vault: primary });
  });

  it('uses the primary vault for an explicit primary pointer', () => {
    expect(resolveActiveVault({ activeSlot: 'primary', format: 'aurionxi-vault-active-slot-v1' }, primary, null, null)).toEqual({
      slot: 'primary',
      vault: primary,
    });
  });

  it.each(['promotion-started', 'candidate-authoritative', 'cleanup-pending'] as const)(
    'resolves the transaction-bound candidate during %s',
    (phase) => {
      expect(resolveActiveVault(candidatePointer, null, candidate, { ...journal, phase })).toEqual({
        slot: 'candidate',
        vault: candidate,
      });
    },
  );

  it.each([
    [candidatePointer, null, null, journal],
    [candidatePointer, null, candidate, null],
    [candidatePointer, null, candidate, { ...journal, phase: 'candidate-verified' as const }],
    [createCandidateActiveSlotRecord('b'.repeat(32)), null, candidate, journal],
    [candidatePointer, null, { ...candidate, publicAddress: primary.publicAddress }, journal],
    [null, null, candidate, journal],
  ])('fails closed for missing or inconsistent active-slot dependencies', (pointer, storedPrimary, storedCandidate, storedJournal) => {
    expect(() => resolveActiveVault(pointer, storedPrimary, storedCandidate, storedJournal)).toThrow(
      ActiveVaultResolutionError,
    );
  });
});
