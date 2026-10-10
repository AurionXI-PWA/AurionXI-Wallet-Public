import { describe, expect, it } from 'vitest';

import type { VaultV3Envelope } from './vault-envelope-v3';
import type { VaultReplacementJournal } from './vault-replacement-journal-core';
import { createRetiredPrimaryCleanupJournal } from './retired-primary-cleanup-journal-core';
import { auditRetiredPrimaryCleanupPreDeletion } from './retired-primary-cleanup-pre-deletion-audit-core';
import type { RetiredPrimaryCleanupSnapshot } from './retired-primary-cleanup-policy';
import { createWalletIdentityRecord } from './wallet-identity-record-core';
import type { WalletIdentityTransitionJournal } from './wallet-identity-transition-journal-core';

const transactionId = '0123456789abcdef0123456789abcdef';
const retiredPrimary = {
  createdAt: '2026-08-08T00:00:00.000Z',
  publicAddress: '0x0000000000000000000000000000000000000001',
} as unknown as VaultV3Envelope;
const activeCandidate = {
  createdAt: '2026-08-09T00:00:00.000Z',
  publicAddress: '0x0000000000000000000000000000000000000002',
} as unknown as VaultV3Envelope;
const retiredIdentity = createWalletIdentityRecord(retiredPrimary.publicAddress, retiredPrimary.createdAt);
const activeIdentity = createWalletIdentityRecord(activeCandidate.publicAddress, activeCandidate.createdAt);
const replacementJournal: VaultReplacementJournal = {
  candidatePublicAddress: activeCandidate.publicAddress,
  createdAt: '2026-08-09T00:00:00.000Z',
  format: 'aurionxi-vault-replacement-journal-v1',
  phase: 'cleanup-pending',
  targetStatus: 'present',
  transactionId,
};
const identityTransitionJournal: WalletIdentityTransitionJournal = {
  createdAt: '2026-08-09T00:01:00.000Z',
  format: 'aurionxi-wallet-identity-transition-v1',
  nextIdentity: activeIdentity,
  phase: 'identity-verified',
  previousIdentity: retiredIdentity,
  replacementTransactionId: transactionId,
};
const cleanupJournal = createRetiredPrimaryCleanupJournal(
  retiredIdentity,
  activeIdentity,
  'present',
  transactionId,
  '2026-08-09T00:02:00.000Z',
);

function snapshot(overrides: Partial<RetiredPrimaryCleanupSnapshot> = {}): RetiredPrimaryCleanupSnapshot {
  return {
    activeCandidate,
    activeSlot: { activeSlot: 'candidate', format: 'aurionxi-vault-active-slot-v1', transactionId },
    cleanupJournal,
    currentIdentity: activeIdentity,
    identityTransitionJournal,
    replacementJournal,
    retiredPrimary,
    retiredPrimaryStatus: 'present',
    ...overrides,
  };
}

describe('retired primary cleanup pre-deletion audit', () => {
  it('reports exact intent-bearing physical scope as ready to resume', () => {
    expect(auditRetiredPrimaryCleanupPreDeletion(snapshot())).toEqual({
      action: 'resume-cleanup',
      state: 'intent-primary-present',
    });
  });

  it('preserves fresh authentication when eligible scope has no intent', () => {
    expect(auditRetiredPrimaryCleanupPreDeletion(snapshot({ cleanupJournal: null }))).toEqual({
      action: 'await-authenticated-cleanup',
      state: 'no-intent',
    });
  });

  it('recognizes deletion-before-phase-write crash recovery without requesting deletion again', () => {
    expect(auditRetiredPrimaryCleanupPreDeletion(snapshot({
      retiredPrimary: null,
      retiredPrimaryStatus: 'empty',
    }))).toEqual({
      action: 'advance-journal',
      state: 'intent-primary-absent',
    });
  });

  it('recognizes primary-removed and finalized only with an empty retired slot', () => {
    expect(auditRetiredPrimaryCleanupPreDeletion(snapshot({
      cleanupJournal: { ...cleanupJournal, phase: 'primary-removed' },
      retiredPrimary: null,
      retiredPrimaryStatus: 'empty',
    }))).toEqual({ action: 'advance-journal', state: 'primary-removed' });
    expect(auditRetiredPrimaryCleanupPreDeletion(snapshot({
      cleanupJournal: { ...cleanupJournal, phase: 'finalized' },
      retiredPrimary: null,
      retiredPrimaryStatus: 'empty',
    }))).toEqual({ action: 'complete', state: 'finalized' });
  });

  it.each([
    { activeSlot: { activeSlot: 'candidate' as const, format: 'aurionxi-vault-active-slot-v1' as const, transactionId: 'abcdef0123456789abcdef0123456789' } },
    { currentIdentity: retiredIdentity },
    { identityTransitionJournal: { ...identityTransitionJournal, phase: 'identity-written' as const } },
    { replacementJournal: { ...replacementJournal, targetStatus: 'corrupt' as const } },
    { retiredPrimary: { ...retiredPrimary, createdAt: '2026-08-08T00:00:01.000Z' } },
    { retiredPrimary: null },
    { retiredPrimaryStatus: 'unsupported' as const, retiredPrimary: null },
    { cleanupJournal: { ...cleanupJournal, phase: 'primary-removed' as const } },
  ])('fails closed for inconsistent pre-deletion scope %#', (override) => {
    expect(auditRetiredPrimaryCleanupPreDeletion(snapshot(override))).toEqual({
      action: 'fail-closed',
      state: 'inconsistent',
    });
  });

  it('has a read-only API with no dependency object or mutation callback', () => {
    expect(auditRetiredPrimaryCleanupPreDeletion.length).toBe(1);
  });
});
