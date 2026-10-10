import { describe, expect, it } from 'vitest';

import type { VaultV3Envelope } from './vault-envelope-v3';
import { createCandidateActiveSlotRecord } from './vault-active-slot-core';
import type { VaultReplacementJournal } from './vault-replacement-journal-core';
import { planVaultReplacementPromotion } from './vault-replacement-promotion-policy';
import type { VaultReplacementResumeState } from './vault-replacement-resume-policy';

const candidate = {
  createdAt: '2026-08-09T00:00:00.000Z',
  format: 'aurionxi-vault-v3',
  payloadCiphertext: 'C'.repeat(40),
  pin: { algorithm: 'argon2id', saltHex: '1'.repeat(32), wrappedVaultKey: 'D'.repeat(40) },
  publicAddress: '0x0000000000000000000000000000000000000002',
} satisfies VaultV3Envelope;
const journal: VaultReplacementJournal = {
  candidatePublicAddress: candidate.publicAddress,
  createdAt: '2026-08-09T01:00:00.000Z',
  format: 'aurionxi-vault-replacement-journal-v1',
  phase: 'candidate-verified',
  targetStatus: 'present',
  transactionId: 'a'.repeat(32),
};
const authorization: VaultReplacementResumeState = {
  authorizationExpiresAt: 1_000,
  requiredAuthentication: 'pin',
  scope: {
    candidatePublicAddress: candidate.publicAddress,
    targetStatus: 'present',
    transactionId: journal.transactionId,
  },
  stage: 'authorized',
};

function snapshot(
  phase: VaultReplacementJournal['phase'],
  activeSlot = phase === 'candidate-verified' || phase === 'promotion-started'
    ? null
    : createCandidateActiveSlotRecord(journal.transactionId),
) {
  return {
    activeSlot,
    candidate,
    journal: { ...journal, phase },
    primaryStatus: 'present' as const,
  };
}

describe('non-destructive candidate promotion protocol', () => {
  it('requires live scoped resume authority before recording promotion intent', () => {
    expect(planVaultReplacementPromotion(snapshot('candidate-verified'), authorization, 1)).toEqual({
      action: 'write-promotion-started',
      state: 'ready',
    });
    expect(planVaultReplacementPromotion(snapshot('candidate-verified'), authorization, 1_000)).toEqual({
      action: 'fail-closed',
      state: 'inconsistent',
    });
  });

  it('activates the candidate pointer only after durable promotion intent', () => {
    expect(planVaultReplacementPromotion(snapshot('promotion-started'), authorization, 1_000)).toEqual({
      action: 'activate-candidate-pointer',
      state: 'intent-recorded',
    });
  });

  it('records candidate authority only after the matching pointer is active', () => {
    expect(planVaultReplacementPromotion(
      snapshot('promotion-started', createCandidateActiveSlotRecord(journal.transactionId)),
      authorization,
      1_000,
    )).toEqual({ action: 'write-candidate-authoritative', state: 'candidate-active' });
  });

  it('moves to cleanup-pending without deleting the primary vault', () => {
    expect(planVaultReplacementPromotion(snapshot('candidate-authoritative'), authorization, 1_000)).toEqual({
      action: 'write-cleanup-pending',
      state: 'authoritative',
    });
    expect(planVaultReplacementPromotion(snapshot('cleanup-pending'), authorization, 1_000)).toEqual({
      action: 'await-authenticated-cleanup',
      state: 'cleanup-pending',
    });
  });

  it.each([
    { candidate: null },
    { candidate: { ...candidate, publicAddress: '0x0000000000000000000000000000000000000003' as const } },
    { journal: null },
    { primaryStatus: 'corrupt' as const },
  ])('fails closed for missing or mismatched promotion scope', (change) => {
    expect(planVaultReplacementPromotion({ ...snapshot('candidate-verified'), ...change }, authorization, 1)).toEqual({
      action: 'fail-closed',
      state: 'inconsistent',
    });
  });

  it('fails closed for a pointer bound to another transaction', () => {
    expect(planVaultReplacementPromotion(
      snapshot('promotion-started', createCandidateActiveSlotRecord('b'.repeat(32))),
      authorization,
      1_000,
    )).toEqual({ action: 'fail-closed', state: 'inconsistent' });
  });
});
