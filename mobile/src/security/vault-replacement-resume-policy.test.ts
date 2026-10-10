import { describe, expect, it } from 'vitest';

import type { VaultReplacementJournal } from './vault-replacement-journal-core';
import {
  canResumeVaultReplacementCandidate,
  INITIAL_VAULT_REPLACEMENT_RESUME_STATE,
  transitionVaultReplacementResume,
  VAULT_REPLACEMENT_RESUME_AUTHORIZATION_MS,
  type VaultReplacementResumeEvent,
} from './vault-replacement-resume-policy';

const journal: VaultReplacementJournal = {
  candidatePublicAddress: '0x0000000000000000000000000000000000000002',
  createdAt: '2026-08-09T01:00:00.000Z',
  format: 'aurionxi-vault-replacement-journal-v1',
  phase: 'candidate-verified',
  targetStatus: 'present',
  transactionId: 'a'.repeat(32),
};
const resumable = { action: 'resume-candidate', state: 'resumable' } as const;

function run(events: VaultReplacementResumeEvent[]) {
  return events.reduce(transitionVaultReplacementResume, INITIAL_VAULT_REPLACEMENT_RESUME_STATE);
}

describe('authenticated candidate resume policy', () => {
  it('requires PIN, then exact confirmation for a present authoritative vault', () => {
    const awaiting = run([{ audit: resumable, journal, type: 'BEGIN' }]);
    expect(awaiting.requiredAuthentication).toBe('pin');
    expect(transitionVaultReplacementResume(awaiting, { now: 1, type: 'RECOVERY_VERIFIED' })).toBe(awaiting);
    const authorized = run([
      { audit: resumable, journal, type: 'BEGIN' },
      { now: 1, type: 'PIN_VERIFIED' },
      { confirmation: 'RESUME', now: 2, type: 'CONFIRM' },
    ]);
    expect(canResumeVaultReplacementCandidate(authorized, journal, 2)).toBe(true);
  });

  it('requires recovery verification for a corrupt authoritative vault', () => {
    const corruptJournal = { ...journal, targetStatus: 'corrupt' as const };
    const awaiting = run([{ audit: resumable, journal: corruptJournal, type: 'BEGIN' }]);
    expect(awaiting.requiredAuthentication).toBe('recovery');
    expect(transitionVaultReplacementResume(awaiting, { now: 1, type: 'PIN_VERIFIED' })).toBe(awaiting);
  });

  it.each([
    { action: 'none', state: 'clean' } as const,
    { action: 'quarantine-candidate', state: 'candidate-without-journal' } as const,
    { action: 'remove-stale-journal', state: 'journal-without-candidate' } as const,
    { action: 'fail-closed', state: 'inconsistent' } as const,
  ])('blocks every non-resumable startup audit', (audit) => {
    expect(run([{ audit, journal, type: 'BEGIN' }])).toEqual({ stage: 'blocked' });
  });

  it('rejects missing journals and journals beyond candidate verification', () => {
    expect(run([{ audit: resumable, journal: null, type: 'BEGIN' }])).toEqual({ stage: 'blocked' });
    expect(run([{ audit: resumable, journal: { ...journal, phase: 'promotion-started' }, type: 'BEGIN' }])).toEqual({ stage: 'blocked' });
  });

  it('requires exact case-sensitive confirmation', () => {
    const state = run([
      { audit: resumable, journal, type: 'BEGIN' },
      { now: 1, type: 'PIN_VERIFIED' },
      { confirmation: 'resume', now: 2, type: 'CONFIRM' },
    ]);
    expect(state.stage).toBe('awaiting-confirmation');
    expect(canResumeVaultReplacementCandidate(state, journal, 2)).toBe(false);
  });

  it('expires at the exact boundary and reset removes authority', () => {
    const authorized = run([
      { audit: resumable, journal, type: 'BEGIN' },
      { now: 100, type: 'PIN_VERIFIED' },
      { confirmation: 'RESUME', now: 101, type: 'CONFIRM' },
    ]);
    expect(canResumeVaultReplacementCandidate(authorized, journal, 100 + VAULT_REPLACEMENT_RESUME_AUTHORIZATION_MS - 1)).toBe(true);
    expect(canResumeVaultReplacementCandidate(authorized, journal, 100 + VAULT_REPLACEMENT_RESUME_AUTHORIZATION_MS)).toBe(false);
    expect(transitionVaultReplacementResume(authorized, { now: 100 + VAULT_REPLACEMENT_RESUME_AUTHORIZATION_MS, type: 'CHECK_EXPIRY' })).toEqual(INITIAL_VAULT_REPLACEMENT_RESUME_STATE);
    expect(transitionVaultReplacementResume(authorized, { type: 'RESET' })).toEqual(INITIAL_VAULT_REPLACEMENT_RESUME_STATE);
  });

  it('binds authority to the exact transaction, candidate address, target status, and phase', () => {
    const authorized = run([
      { audit: resumable, journal, type: 'BEGIN' },
      { now: 1, type: 'PIN_VERIFIED' },
      { confirmation: 'RESUME', now: 2, type: 'CONFIRM' },
    ]);
    expect(canResumeVaultReplacementCandidate(authorized, { ...journal, transactionId: 'b'.repeat(32) }, 2)).toBe(false);
    expect(canResumeVaultReplacementCandidate(authorized, { ...journal, candidatePublicAddress: '0x0000000000000000000000000000000000000003' }, 2)).toBe(false);
    expect(canResumeVaultReplacementCandidate(authorized, { ...journal, targetStatus: 'corrupt' }, 2)).toBe(false);
    expect(canResumeVaultReplacementCandidate(authorized, { ...journal, phase: 'promotion-started' }, 2)).toBe(false);
  });

  it('stores no PIN, recovery phrase, or candidate secret', () => {
    const state = run([
      { audit: resumable, journal, type: 'BEGIN' },
      { now: 1, type: 'PIN_VERIFIED' },
    ]);
    expect(JSON.stringify(state)).not.toMatch(/mnemonic|phrase|payload|ciphertext|private/i);
  });
});
