import { describe, expect, it } from 'vitest';

import type { VaultV3Envelope } from './vault-envelope-v3';
import type { VaultReplacementJournal } from './vault-replacement-journal-core';
import type { RetiredPrimaryCleanupAuthorization } from './retired-primary-cleanup-authorization';
import {
  executeNextRetiredPrimaryCleanupStep,
  recordAuthorizedRetiredPrimaryCleanupIntent,
} from './retired-primary-cleanup-executor-core';
import type { RetiredPrimaryCleanupJournal } from './retired-primary-cleanup-journal-core';
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

function initialSnapshot(): RetiredPrimaryCleanupSnapshot {
  return {
    activeCandidate,
    activeSlot: { activeSlot: 'candidate', format: 'aurionxi-vault-active-slot-v1', transactionId },
    cleanupJournal: null,
    currentIdentity: activeIdentity,
    identityTransitionJournal,
    replacementJournal,
    retiredPrimary,
    retiredPrimaryStatus: 'present',
  };
}

function authorization(snapshot: RetiredPrimaryCleanupSnapshot, expiresAt = 61_000): RetiredPrimaryCleanupAuthorization {
  const plan = planRetiredPrimaryCleanup(snapshot);
  if (plan.action !== 'require-authenticated-cleanup') throw new Error('Fixture must be eligible.');
  return { authorizationExpiresAt: expiresAt, scope: plan.scope, stage: 'authorized' };
}

function harness() {
  let state = initialSnapshot();
  let deleteCalls = 0;
  let failDeleteReadback = false;
  const dependencies = {
    deleteRetiredPrimary: async () => {
      deleteCalls += 1;
      if (!failDeleteReadback) state = { ...state, retiredPrimary: null, retiredPrimaryStatus: 'empty' };
    },
    readSnapshot: async () => state,
    writeJournalVerified: async (journal: RetiredPrimaryCleanupJournal) => {
      state = { ...state, cleanupJournal: journal };
      return journal;
    },
  };
  return {
    dependencies,
    getDeleteCalls: () => deleteCalls,
    getState: () => state,
    setDeleteReadbackFailure: () => { failDeleteReadback = true; },
    setState: (next: RetiredPrimaryCleanupSnapshot) => { state = next; },
  };
}

describe('retired primary cleanup executor', () => {
  it('provides a race-safe intent-only boundary with no delete dependency', async () => {
    const test = harness();
    const auth = authorization(test.getState());
    const intentDependencies = {
      readSnapshot: test.dependencies.readSnapshot,
      writeJournalVerified: test.dependencies.writeJournalVerified,
    };
    await expect(recordAuthorizedRetiredPrimaryCleanupIntent(auth, intentDependencies, 2_000))
      .resolves.toEqual({ action: 'write-intent' });
    expect(Object.keys(intentDependencies).sort()).toEqual(['readSnapshot', 'writeJournalVerified']);
    expect(test.getDeleteCalls()).toBe(0);

    await expect(recordAuthorizedRetiredPrimaryCleanupIntent(auth, intentDependencies, 2_001))
      .rejects.toThrow('authorization is invalid');
    expect(test.getDeleteCalls()).toBe(0);
  });

  it('records durable intent before exposing the destructive boundary', async () => {
    const test = harness();
    const auth = authorization(test.getState());
    await expect(executeNextRetiredPrimaryCleanupStep(auth, test.dependencies, 2_000))
      .resolves.toEqual({ action: 'write-intent' });
    expect(test.getDeleteCalls()).toBe(0);
    expect(test.getState().cleanupJournal?.phase).toBe('intent-recorded');
    expect(Object.keys(test.dependencies).sort()).toEqual([
      'deleteRetiredPrimary', 'readSnapshot', 'writeJournalVerified',
    ]);
  });

  it('deletes only after intent, verifies empty storage, then advances one durable phase per call', async () => {
    const test = harness();
    const auth = authorization(test.getState());
    await executeNextRetiredPrimaryCleanupStep(auth, test.dependencies, 2_000);
    await expect(executeNextRetiredPrimaryCleanupStep(auth, test.dependencies, 2_001))
      .resolves.toEqual({ action: 'remove-retired-primary' });
    expect(test.getDeleteCalls()).toBe(1);
    expect(test.getState().cleanupJournal?.phase).toBe('intent-recorded');
    await expect(executeNextRetiredPrimaryCleanupStep(auth, test.dependencies, 2_002))
      .resolves.toEqual({ action: 'mark-primary-removed' });
    await expect(executeNextRetiredPrimaryCleanupStep(auth, test.dependencies, 2_003))
      .resolves.toEqual({ action: 'mark-finalized' });
    await expect(executeNextRetiredPrimaryCleanupStep(auth, test.dependencies, 2_004))
      .resolves.toEqual({ action: 'complete' });
    expect(test.getDeleteCalls()).toBe(1);
  });

  it('recovers a crash after deletion without deleting twice', async () => {
    const test = harness();
    const auth = authorization(test.getState());
    await executeNextRetiredPrimaryCleanupStep(auth, test.dependencies, 2_000);
    test.setState({ ...test.getState(), retiredPrimary: null, retiredPrimaryStatus: 'empty' });
    await expect(executeNextRetiredPrimaryCleanupStep(auth, test.dependencies, 2_001))
      .resolves.toEqual({ action: 'mark-primary-removed' });
    expect(test.getDeleteCalls()).toBe(0);
  });

  it('rejects missing authorization without writing or deleting', async () => {
    const test = harness();
    await expect(executeNextRetiredPrimaryCleanupStep({ stage: 'idle' }, test.dependencies, 2_000))
      .rejects.toThrow('authorization is invalid');
    expect(test.getState().cleanupJournal).toBeNull();
    expect(test.getDeleteCalls()).toBe(0);
  });

  it('fails closed when deletion cannot be verified', async () => {
    const test = harness();
    const auth = authorization(test.getState());
    await executeNextRetiredPrimaryCleanupStep(auth, test.dependencies, 2_000);
    test.setDeleteReadbackFailure();
    await expect(executeNextRetiredPrimaryCleanupStep(auth, test.dependencies, 2_001))
      .rejects.toThrow('failed post-delete verification');
    expect(test.getState().cleanupJournal?.phase).toBe('intent-recorded');
    expect(test.getDeleteCalls()).toBe(1);
  });

  it('fails closed when durable intent changes across the delete boundary', async () => {
    const test = harness();
    const auth = authorization(test.getState());
    await executeNextRetiredPrimaryCleanupStep(auth, test.dependencies, 2_000);
    const originalDelete = test.dependencies.deleteRetiredPrimary;
    test.dependencies.deleteRetiredPrimary = async () => {
      await originalDelete();
      const journal = test.getState().cleanupJournal;
      if (!journal) throw new Error('Fixture intent is missing.');
      test.setState({ ...test.getState(), cleanupJournal: { ...journal, createdAt: '2026-08-09T00:03:00.000Z' } });
    };
    await expect(executeNextRetiredPrimaryCleanupStep(auth, test.dependencies, 2_001))
      .rejects.toThrow('failed post-delete verification');
    expect(test.getDeleteCalls()).toBe(1);
  });

  it('rejects a replacement target mismatch before deletion', async () => {
    const test = harness();
    const auth = authorization(test.getState());
    await executeNextRetiredPrimaryCleanupStep(auth, test.dependencies, 2_000);
    test.setState({
      ...test.getState(),
      replacementJournal: { ...replacementJournal, targetStatus: 'corrupt' },
    });
    await expect(executeNextRetiredPrimaryCleanupStep(auth, test.dependencies, 2_001))
      .rejects.toThrow('state is inconsistent');
    expect(test.getDeleteCalls()).toBe(0);
  });
});
