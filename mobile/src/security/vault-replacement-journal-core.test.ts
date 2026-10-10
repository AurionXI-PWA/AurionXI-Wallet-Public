import { describe, expect, it } from 'vitest';

import type { VaultV3Envelope } from './vault-envelope-v3';
import {
  auditVaultReplacementRecovery,
  createVerifiedCandidateJournal,
  isVaultReplacementJournal,
} from './vault-replacement-journal-core';

const candidate = {
  createdAt: '2026-08-09T00:00:00.000Z',
  format: 'aurionxi-vault-v3',
  payloadCiphertext: 'C'.repeat(40),
  pin: { algorithm: 'argon2id', saltHex: '1'.repeat(32), wrappedVaultKey: 'D'.repeat(40) },
  publicAddress: '0x0000000000000000000000000000000000000002',
} satisfies VaultV3Envelope;

const journal = createVerifiedCandidateJournal(
  candidate,
  'present',
  'a'.repeat(32),
  '2026-08-09T01:00:00.000Z',
);

describe('vault replacement crash-recovery journal', () => {
  it('creates only a valid candidate-verified journal', () => {
    expect(isVaultReplacementJournal(journal)).toBe(true);
    expect(journal.phase).toBe('candidate-verified');
    expect(journal).not.toHaveProperty('pin');
    expect(journal).not.toHaveProperty('payloadCiphertext');
  });

  it.each([
    { ...journal, transactionId: 'bad' },
    { ...journal, createdAt: 'not-a-date' },
    { ...journal, candidatePublicAddress: '0x1234' },
    { ...journal, phase: 'unknown' },
    { ...journal, pin: 'must-never-be-stored' },
  ])('rejects malformed journal metadata', (value) => {
    expect(isVaultReplacementJournal(value)).toBe(false);
  });

  it('classifies clean, resumable, quarantined, stale, and inconsistent states', () => {
    expect(auditVaultReplacementRecovery(null, null)).toEqual({ action: 'none', state: 'clean' });
    expect(auditVaultReplacementRecovery(candidate, journal)).toEqual({ action: 'resume-candidate', state: 'resumable' });
    expect(auditVaultReplacementRecovery(candidate, null)).toEqual({ action: 'quarantine-candidate', state: 'candidate-without-journal' });
    expect(auditVaultReplacementRecovery(null, journal)).toEqual({ action: 'remove-stale-journal', state: 'journal-without-candidate' });
    expect(auditVaultReplacementRecovery(candidate, { ...journal, phase: 'promotion-started' })).toEqual({ action: 'continue-promotion', state: 'promotion-recovery' });
    expect(auditVaultReplacementRecovery(candidate, { ...journal, phase: 'candidate-authoritative' })).toEqual({ action: 'continue-promotion', state: 'promotion-recovery' });
    expect(auditVaultReplacementRecovery(candidate, { ...journal, phase: 'cleanup-pending' })).toEqual({ action: 'await-cleanup', state: 'cleanup-pending' });
    expect(auditVaultReplacementRecovery(candidate, { ...journal, candidatePublicAddress: '0x0000000000000000000000000000000000000003' })).toEqual({ action: 'fail-closed', state: 'inconsistent' });
  });
});
