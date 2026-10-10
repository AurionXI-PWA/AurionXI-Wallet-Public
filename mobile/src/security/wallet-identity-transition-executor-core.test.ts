import { describe, expect, it, vi } from 'vitest';

import type { VaultV3Envelope } from './vault-envelope-v3';
import type { VaultReplacementJournal } from './vault-replacement-journal-core';
import type { WalletIdentityTransitionAuthorization } from './wallet-identity-transition-authorization';
import {
  executeNextWalletIdentityTransitionStep,
  type WalletIdentityTransitionExecutorDependencies,
  type WalletIdentityTransitionExecutorSnapshot,
} from './wallet-identity-transition-executor-core';
import type { WalletIdentityTransitionJournal } from './wallet-identity-transition-journal-core';
import { planWalletIdentityTransition } from './wallet-identity-transition-policy';
import { createWalletIdentityRecord, type WalletIdentityRecord } from './wallet-identity-record-core';

const transactionId = '0123456789abcdef0123456789abcdef';
const previousIdentity = createWalletIdentityRecord(
  '0x0000000000000000000000000000000000000001',
  '2026-08-08T00:00:00.000Z',
);
const activeVault = {
  createdAt: '2026-08-09T00:00:00.000Z',
  publicAddress: '0x0000000000000000000000000000000000000002',
} as unknown as VaultV3Envelope;
const replacementJournal: VaultReplacementJournal = {
  candidatePublicAddress: activeVault.publicAddress,
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

function createHarness() {
  let identity: WalletIdentityRecord | null = previousIdentity;
  let transitionJournal: WalletIdentityTransitionJournal | null = null;
  const snapshot = (): WalletIdentityTransitionExecutorSnapshot => ({
    activeSlot,
    activeVault,
    identity,
    replacementJournal,
    transitionJournal,
  });
  const dependencies: WalletIdentityTransitionExecutorDependencies = {
    readIdentity: vi.fn(async () => identity),
    readSnapshot: vi.fn(async () => snapshot()),
    writeIdentity: vi.fn(async (next) => { identity = next; }),
    writeJournalVerified: vi.fn(async (next) => {
      transitionJournal = next;
      return next;
    }),
  };
  const plan = planWalletIdentityTransition({ ...snapshot(), transitionJournal: null });
  if (plan.action !== 'require-authenticated-transition') throw new Error('fixture plan failed');
  const authorization: WalletIdentityTransitionAuthorization = {
    authorizationExpiresAt: 61_000,
    scope: plan.scope,
    stage: 'authorized',
  };
  return {
    authorization,
    dependencies,
    getIdentity: () => identity,
    getJournal: () => transitionJournal,
    setIdentity: (next: WalletIdentityRecord | null) => { identity = next; },
    setJournal: (next: WalletIdentityTransitionJournal | null) => { transitionJournal = next; },
  };
}

describe('crash-safe wallet identity transition executor', () => {
  it('advances exactly one durable step per invocation and preserves previous identity in intent', async () => {
    const harness = createHarness();
    await expect(executeNextWalletIdentityTransitionStep(
      harness.authorization,
      harness.dependencies,
      1_000,
    )).resolves.toEqual({ action: 'write-intent' });
    expect(harness.getIdentity()).toEqual(previousIdentity);
    expect(harness.getJournal()).toEqual(expect.objectContaining({
      phase: 'intent-recorded',
      previousIdentity,
      replacementTransactionId: transactionId,
    }));

    await expect(executeNextWalletIdentityTransitionStep(
      harness.authorization,
      harness.dependencies,
      2_000,
    )).resolves.toEqual({ action: 'write-next-identity' });
    expect(harness.getJournal()?.phase).toBe('intent-recorded');

    await expect(executeNextWalletIdentityTransitionStep(
      harness.authorization,
      harness.dependencies,
      3_000,
    )).resolves.toEqual({ action: 'mark-identity-written' });
    expect(harness.getJournal()?.phase).toBe('identity-written');

    await expect(executeNextWalletIdentityTransitionStep(
      harness.authorization,
      harness.dependencies,
      4_000,
    )).resolves.toEqual({ action: 'mark-identity-verified' });
    expect(harness.getJournal()?.phase).toBe('identity-verified');

    await expect(executeNextWalletIdentityTransitionStep(
      harness.authorization,
      harness.dependencies,
      5_000,
    )).resolves.toEqual({ action: 'complete' });
    expect(harness.dependencies.writeIdentity).toHaveBeenCalledTimes(1);
  });

  it('requires fresh authorization before writing durable intent', async () => {
    const harness = createHarness();
    await expect(executeNextWalletIdentityTransitionStep(
      { stage: 'idle' },
      harness.dependencies,
      1_000,
    )).rejects.toThrow('authorization is invalid');
    expect(harness.dependencies.writeJournalVerified).not.toHaveBeenCalled();
    expect(harness.dependencies.writeIdentity).not.toHaveBeenCalled();
  });

  it('recovers a crash after identity write without rewriting identity', async () => {
    const harness = createHarness();
    await executeNextWalletIdentityTransitionStep(harness.authorization, harness.dependencies, 1_000);
    harness.setIdentity(harness.getJournal()!.nextIdentity);
    await expect(executeNextWalletIdentityTransitionStep(
      { stage: 'idle' },
      harness.dependencies,
      2_000,
    )).resolves.toEqual({ action: 'mark-identity-written' });
    expect(harness.dependencies.writeIdentity).not.toHaveBeenCalled();
  });

  it('fails if identity write does not read back exactly', async () => {
    const harness = createHarness();
    await executeNextWalletIdentityTransitionStep(harness.authorization, harness.dependencies, 1_000);
    vi.mocked(harness.dependencies.writeIdentity).mockImplementationOnce(async () => undefined);
    await expect(executeNextWalletIdentityTransitionStep(
      { stage: 'idle' },
      harness.dependencies,
      2_000,
    )).rejects.toThrow('read-back verification');
    expect(harness.getJournal()?.phase).toBe('intent-recorded');
  });

  it('fails closed for a replacement transaction mismatch', async () => {
    const harness = createHarness();
    await executeNextWalletIdentityTransitionStep(harness.authorization, harness.dependencies, 1_000);
    const journal = harness.getJournal()!;
    harness.setJournal({
      ...journal,
      replacementTransactionId: 'abcdef0123456789abcdef0123456789',
    });
    await expect(executeNextWalletIdentityTransitionStep(
      { stage: 'idle' },
      harness.dependencies,
      2_000,
    )).rejects.toThrow('state is inconsistent');
    expect(harness.dependencies.writeIdentity).not.toHaveBeenCalled();
  });
});
