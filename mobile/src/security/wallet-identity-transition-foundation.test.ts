import { describe, expect, it } from 'vitest';

import type { VaultV3Envelope } from './vault-envelope-v3';
import type { VaultReplacementJournal } from './vault-replacement-journal-core';
import {
  canExecuteWalletIdentityTransition,
  INITIAL_WALLET_IDENTITY_TRANSITION_AUTHORIZATION,
  transitionWalletIdentityAuthorization,
  WALLET_IDENTITY_TRANSITION_CONFIRMATION,
} from './wallet-identity-transition-authorization';
import {
  createWalletIdentityTransitionJournal,
  isWalletIdentityTransitionJournal,
} from './wallet-identity-transition-journal-core';
import { planWalletIdentityTransition } from './wallet-identity-transition-policy';
import { createWalletIdentityRecord } from './wallet-identity-record-core';

const transactionId = '0123456789abcdef0123456789abcdef';
const previousIdentity = createWalletIdentityRecord(
  '0x0000000000000000000000000000000000000001',
  '2026-08-08T00:00:00.000Z',
);
const vault = {
  createdAt: '2026-08-09T00:00:00.000Z',
  format: 'aurionxi-vault-v3',
  payloadCiphertext: 'C'.repeat(40),
  pin: { algorithm: 'argon2id', saltHex: '1'.repeat(32), wrappedVaultKey: 'D'.repeat(40) },
  publicAddress: '0x0000000000000000000000000000000000000002',
} satisfies VaultV3Envelope;
const nextIdentity = createWalletIdentityRecord(vault.publicAddress, vault.createdAt);
const replacementJournal: VaultReplacementJournal = {
  candidatePublicAddress: vault.publicAddress,
  createdAt: '2026-08-09T00:00:00.000Z',
  format: 'aurionxi-vault-replacement-journal-v1',
  phase: 'cleanup-pending',
  targetStatus: 'present',
  transactionId,
};
const activeSlot = {
  activeSlot: 'candidate',
  format: 'aurionxi-vault-active-slot-v1',
  transactionId,
} as const;

function eligiblePlan() {
  return planWalletIdentityTransition({
    activeSlot,
    activeVault: vault,
    identity: previousIdentity,
    replacementJournal,
    transitionJournal: null,
  });
}

describe('wallet identity transition journal', () => {
  it('creates strict durable intent bound to both identities and replacement transaction', () => {
    const journal = createWalletIdentityTransitionJournal(
      previousIdentity,
      nextIdentity,
      transactionId,
      '2026-08-09T00:01:00.000Z',
    );
    expect(isWalletIdentityTransitionJournal(journal)).toBe(true);
    expect(isWalletIdentityTransitionJournal({ ...journal, unexpected: true })).toBe(false);
    expect(isWalletIdentityTransitionJournal({ ...journal, replacementTransactionId: 'bad' })).toBe(false);
  });

  it('rejects a journal that does not change wallet identity', () => {
    expect(() => createWalletIdentityTransitionJournal(
      previousIdentity,
      previousIdentity,
      transactionId,
      '2026-08-09T00:01:00.000Z',
    )).toThrow('journal is invalid');
  });
});

describe('wallet identity transition eligibility', () => {
  it('requires an authenticated transition for a different active candidate identity', () => {
    expect(eligiblePlan()).toEqual(expect.objectContaining({
      action: 'require-authenticated-transition',
      state: 'eligible',
    }));
  });

  it('does nothing when active candidate is already bound to identity', () => {
    expect(planWalletIdentityTransition({
      activeSlot,
      activeVault: vault,
      identity: nextIdentity,
      replacementJournal,
      transitionJournal: null,
    })).toEqual({ action: 'none', state: 'already-bound' });
  });

  it.each([
    { activeSlot: null },
    { activeSlot: { ...activeSlot, transactionId: 'abcdef0123456789abcdef0123456789' } },
    { activeVault: null },
    { identity: null },
    { replacementJournal: { ...replacementJournal, phase: 'candidate-authoritative' as const } },
    { replacementJournal: { ...replacementJournal, candidatePublicAddress: previousIdentity.publicAddress } },
    {
      transitionJournal: createWalletIdentityTransitionJournal(
        previousIdentity,
        nextIdentity,
        transactionId,
        '2026-08-09T00:01:00.000Z',
      ),
    },
  ])('fails closed for inconsistent eligibility %#', (override) => {
    expect(planWalletIdentityTransition({
      activeSlot,
      activeVault: vault,
      identity: previousIdentity,
      replacementJournal,
      transitionJournal: null,
      ...override,
    })).toEqual({ action: 'fail-closed', state: 'inconsistent' });
  });
});

describe('wallet identity transition authorization', () => {
  it('requires PIN verification and exact confirmation within sixty seconds', () => {
    const plan = eligiblePlan();
    let state = transitionWalletIdentityAuthorization(
      INITIAL_WALLET_IDENTITY_TRANSITION_AUTHORIZATION,
      { plan, type: 'BEGIN' },
    );
    expect(state.stage).toBe('awaiting-pin');
    state = transitionWalletIdentityAuthorization(state, { now: 1_000, type: 'PIN_VERIFIED' });
    state = transitionWalletIdentityAuthorization(state, {
      confirmation: 'update identity',
      now: 2_000,
      type: 'CONFIRM',
    });
    expect(state.stage).toBe('awaiting-confirmation');
    state = transitionWalletIdentityAuthorization(state, {
      confirmation: WALLET_IDENTITY_TRANSITION_CONFIRMATION,
      now: 2_000,
      type: 'CONFIRM',
    });
    expect(state.stage).toBe('authorized');
    expect(canExecuteWalletIdentityTransition(state, plan, 60_999)).toBe(true);
    expect(canExecuteWalletIdentityTransition(state, plan, 61_000)).toBe(false);
  });

  it('rejects stale authorization when the fresh identity scope changes', () => {
    const plan = eligiblePlan();
    let state = transitionWalletIdentityAuthorization(
      INITIAL_WALLET_IDENTITY_TRANSITION_AUTHORIZATION,
      { plan, type: 'BEGIN' },
    );
    state = transitionWalletIdentityAuthorization(state, { now: 1_000, type: 'PIN_VERIFIED' });
    state = transitionWalletIdentityAuthorization(state, {
      confirmation: WALLET_IDENTITY_TRANSITION_CONFIRMATION,
      now: 2_000,
      type: 'CONFIRM',
    });
    const changed = planWalletIdentityTransition({
      activeSlot,
      activeVault: { ...vault, createdAt: '2026-08-09T00:00:01.000Z' },
      identity: previousIdentity,
      replacementJournal,
      transitionJournal: null,
    });
    expect(canExecuteWalletIdentityTransition(state, changed, 3_000)).toBe(false);
  });

  it('blocks authorization for non-eligible plans', () => {
    expect(transitionWalletIdentityAuthorization(
      INITIAL_WALLET_IDENTITY_TRANSITION_AUTHORIZATION,
      { plan: { action: 'fail-closed', state: 'inconsistent' }, type: 'BEGIN' },
    )).toEqual({ stage: 'blocked' });
  });
});
