import { describe, expect, it } from 'vitest';

import type { VaultV3Envelope } from './vault-envelope-v3';
import type { VaultReplacementJournal } from './vault-replacement-journal-core';
import {
  canCreateRetiredPrimaryCleanupIntent,
  INITIAL_RETIRED_PRIMARY_CLEANUP_AUTHORIZATION,
  RETIRED_PRIMARY_CLEANUP_CONFIRMATION,
  transitionRetiredPrimaryCleanupAuthorization,
} from './retired-primary-cleanup-authorization';
import {
  createRetiredPrimaryCleanupJournal,
  isRetiredPrimaryCleanupJournal,
} from './retired-primary-cleanup-journal-core';
import { planRetiredPrimaryCleanup, type RetiredPrimaryCleanupSnapshot } from './retired-primary-cleanup-policy';
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
const activeSlot = {
  activeSlot: 'candidate',
  format: 'aurionxi-vault-active-slot-v1',
  transactionId,
} as const;

function snapshot(overrides: Partial<RetiredPrimaryCleanupSnapshot> = {}): RetiredPrimaryCleanupSnapshot {
  return {
    activeCandidate,
    activeSlot,
    cleanupJournal: null,
    currentIdentity: activeIdentity,
    identityTransitionJournal,
    replacementJournal,
    retiredPrimary,
    retiredPrimaryStatus: 'present',
    ...overrides,
  };
}

describe('retired primary cleanup journal', () => {
  it('creates strict public intent bound to retired and active identity', () => {
    const journal = createRetiredPrimaryCleanupJournal(
      retiredIdentity,
      activeIdentity,
      'present',
      transactionId,
      '2026-08-09T00:02:00.000Z',
    );
    expect(isRetiredPrimaryCleanupJournal(journal)).toBe(true);
    expect(isRetiredPrimaryCleanupJournal({ ...journal, pin: 'blocked' })).toBe(false);
    expect(isRetiredPrimaryCleanupJournal({ ...journal, replacementTransactionId: 'bad' })).toBe(false);
  });

  it('rejects no-op cleanup identity scope', () => {
    expect(() => createRetiredPrimaryCleanupJournal(
      activeIdentity,
      activeIdentity,
      'present',
      transactionId,
      '2026-08-09T00:02:00.000Z',
    )).toThrow('journal is invalid');
  });
});

describe('retired primary cleanup eligibility', () => {
  it('requires authenticated cleanup only after verified identity transition', () => {
    expect(planRetiredPrimaryCleanup(snapshot())).toEqual(expect.objectContaining({
      action: 'require-authenticated-cleanup',
      state: 'eligible',
    }));
  });

  it('supports an explicitly corrupt retired primary without pretending it is readable', () => {
    expect(planRetiredPrimaryCleanup(snapshot({
      replacementJournal: { ...replacementJournal, targetStatus: 'corrupt' },
      retiredPrimary: null,
      retiredPrimaryStatus: 'corrupt',
    }))).toEqual(expect.objectContaining({ action: 'require-authenticated-cleanup' }));
  });

  it.each([
    { activeSlot: null },
    { activeSlot: { ...activeSlot, transactionId: 'abcdef0123456789abcdef0123456789' } },
    { activeCandidate: null },
    { currentIdentity: retiredIdentity },
    { identityTransitionJournal: { ...identityTransitionJournal, phase: 'identity-written' as const } },
    { identityTransitionJournal: { ...identityTransitionJournal, replacementTransactionId: 'abcdef0123456789abcdef0123456789' } },
    { replacementJournal: { ...replacementJournal, phase: 'candidate-authoritative' as const } },
    { retiredPrimary: { ...retiredPrimary, createdAt: '2026-08-08T00:00:01.000Z' } },
    { retiredPrimaryStatus: 'empty' as const, retiredPrimary: null },
    {
      cleanupJournal: createRetiredPrimaryCleanupJournal(
        retiredIdentity,
        activeIdentity,
        'present',
        transactionId,
        '2026-08-09T00:02:00.000Z',
      ),
    },
  ])('fails closed for inconsistent cleanup scope %#', (override) => {
    expect(planRetiredPrimaryCleanup(snapshot(override))).toEqual({
      action: 'fail-closed',
      state: 'inconsistent',
    });
  });
});

describe('retired primary cleanup authorization', () => {
  it('requires PIN verification and exact confirmation within sixty seconds', () => {
    const plan = planRetiredPrimaryCleanup(snapshot());
    let state = transitionRetiredPrimaryCleanupAuthorization(
      INITIAL_RETIRED_PRIMARY_CLEANUP_AUTHORIZATION,
      { plan, type: 'BEGIN' },
    );
    expect(state.stage).toBe('awaiting-pin');
    state = transitionRetiredPrimaryCleanupAuthorization(state, { now: 1_000, type: 'PIN_VERIFIED' });
    state = transitionRetiredPrimaryCleanupAuthorization(state, {
      confirmation: 'remove retired wallet',
      now: 2_000,
      type: 'CONFIRM',
    });
    expect(state.stage).toBe('awaiting-confirmation');
    state = transitionRetiredPrimaryCleanupAuthorization(state, {
      confirmation: RETIRED_PRIMARY_CLEANUP_CONFIRMATION,
      now: 2_000,
      type: 'CONFIRM',
    });
    expect(state.stage).toBe('authorized');
    expect(canCreateRetiredPrimaryCleanupIntent(state, plan, 60_999)).toBe(true);
    expect(canCreateRetiredPrimaryCleanupIntent(state, plan, 61_000)).toBe(false);
  });

  it('rejects authorization against a changed fresh transaction scope', () => {
    const plan = planRetiredPrimaryCleanup(snapshot());
    let state = transitionRetiredPrimaryCleanupAuthorization(
      INITIAL_RETIRED_PRIMARY_CLEANUP_AUTHORIZATION,
      { plan, type: 'BEGIN' },
    );
    state = transitionRetiredPrimaryCleanupAuthorization(state, { now: 1_000, type: 'PIN_VERIFIED' });
    state = transitionRetiredPrimaryCleanupAuthorization(state, {
      confirmation: RETIRED_PRIMARY_CLEANUP_CONFIRMATION,
      now: 2_000,
      type: 'CONFIRM',
    });
    const changedPlan = planRetiredPrimaryCleanup(snapshot({
      activeSlot: { ...activeSlot, transactionId: 'abcdef0123456789abcdef0123456789' },
    }));
    expect(canCreateRetiredPrimaryCleanupIntent(state, changedPlan, 3_000)).toBe(false);
  });

  it('blocks direct authorization for an inconsistent plan', () => {
    expect(transitionRetiredPrimaryCleanupAuthorization(
      INITIAL_RETIRED_PRIMARY_CLEANUP_AUTHORIZATION,
      { plan: { action: 'fail-closed', state: 'inconsistent' }, type: 'BEGIN' },
    )).toEqual({ stage: 'blocked' });
  });
});
