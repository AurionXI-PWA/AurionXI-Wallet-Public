import { describe, expect, it, vi } from 'vitest';

import type { VaultReplacementJournal } from './vault-replacement-journal-core';
import {
  coordinateStartupVaultReplacementPromotionRecovery,
  type VaultReplacementPromotionRecoverySnapshot,
} from './vault-replacement-promotion-recovery-core';
import type { VaultV3Envelope } from './vault-envelope-v3';
import { createRetiredPrimaryCleanupJournal } from './retired-primary-cleanup-journal-core';
import { createWalletIdentityRecord } from './wallet-identity-record-core';

const candidate = {
  createdAt: '2026-08-09T00:00:00.000Z',
  publicAddress: '0x0000000000000000000000000000000000000001',
} as unknown as VaultV3Envelope;
const journal: VaultReplacementJournal = {
  candidatePublicAddress: candidate.publicAddress,
  createdAt: '2026-08-09T00:00:00.000Z',
  format: 'aurionxi-vault-replacement-journal-v1',
  phase: 'candidate-verified',
  targetStatus: 'present',
  transactionId: '0123456789abcdef0123456789abcdef',
};

function snapshot(
  overrides: Partial<VaultReplacementPromotionRecoverySnapshot> = {},
): VaultReplacementPromotionRecoverySnapshot {
  return {
    activeSlot: null,
    candidate,
    cleanupJournal: null,
    journal,
    primaryStatus: 'present',
    ...overrides,
  };
}

async function run(value: VaultReplacementPromotionRecoverySnapshot) {
  const executeDurablePromotionStep = vi.fn().mockResolvedValue(undefined);
  const result = await coordinateStartupVaultReplacementPromotionRecovery({
    executeDurablePromotionStep,
    readSnapshot: vi.fn().mockResolvedValue(value),
  });
  return { executeDurablePromotionStep, result };
}

describe('startup vault replacement promotion recovery coordinator', () => {
  it('reports a clean legacy primary state without writes', async () => {
    const { executeDurablePromotionStep, result } = await run(snapshot({ candidate: null, journal: null }));
    expect(result).toEqual({ action: 'none', state: 'clean' });
    expect(executeDurablePromotionStep).not.toHaveBeenCalled();
  });

  it('requires authenticated promotion before durable intent', async () => {
    const { executeDurablePromotionStep, result } = await run(snapshot());
    expect(result).toEqual({ action: 'await-authenticated-promotion', state: 'pre-intent' });
    expect(executeDurablePromotionStep).not.toHaveBeenCalled();
  });

  it.each([
    ['promotion-started', null],
    ['promotion-started', { activeSlot: 'candidate', format: 'aurionxi-vault-active-slot-v1', transactionId: journal.transactionId }],
    ['candidate-authoritative', { activeSlot: 'candidate', format: 'aurionxi-vault-active-slot-v1', transactionId: journal.transactionId }],
  ] as const)('advances one durable step for %s', async (phase, activeSlot) => {
    const { executeDurablePromotionStep, result } = await run(snapshot({
      activeSlot,
      journal: { ...journal, phase },
    }));
    expect(result).toEqual({ action: 'advance-durable-promotion', state: 'recoverable' });
    expect(executeDurablePromotionStep).toHaveBeenCalledTimes(1);
  });

  it('stops at cleanup pending without invoking cleanup', async () => {
    const { executeDurablePromotionStep, result } = await run(snapshot({
      activeSlot: {
        activeSlot: 'candidate',
        format: 'aurionxi-vault-active-slot-v1',
        transactionId: journal.transactionId,
      },
      journal: { ...journal, phase: 'cleanup-pending' },
    }));
    expect(result).toEqual({ action: 'await-authenticated-cleanup', state: 'cleanup-pending' });
    expect(executeDurablePromotionStep).not.toHaveBeenCalled();
  });

  it('accepts an empty retired primary only with matching durable cleanup intent', async () => {
    const activeSlot = {
      activeSlot: 'candidate' as const,
      format: 'aurionxi-vault-active-slot-v1' as const,
      transactionId: journal.transactionId,
    };
    const cleanupJournal = createRetiredPrimaryCleanupJournal(
      createWalletIdentityRecord(
        '0x0000000000000000000000000000000000000002',
        '2026-08-08T00:00:00.000Z',
      ),
      createWalletIdentityRecord(candidate.publicAddress, candidate.createdAt),
      'present',
      journal.transactionId,
      '2026-08-09T00:02:00.000Z',
    );
    const { executeDurablePromotionStep, result } = await run(snapshot({
      activeSlot,
      cleanupJournal,
      journal: { ...journal, phase: 'cleanup-pending' },
      primaryStatus: 'empty',
    }));
    expect(result).toEqual({ action: 'await-authenticated-cleanup', state: 'cleanup-pending' });
    expect(executeDurablePromotionStep).not.toHaveBeenCalled();
  });

  it('rejects an empty primary when cleanup intent is missing or mismatched', async () => {
    const activeSlot = {
      activeSlot: 'candidate' as const,
      format: 'aurionxi-vault-active-slot-v1' as const,
      transactionId: journal.transactionId,
    };
    const { result } = await run(snapshot({
      activeSlot,
      journal: { ...journal, phase: 'cleanup-pending' },
      primaryStatus: 'empty',
    }));
    expect(result).toEqual({ action: 'fail-closed', state: 'inconsistent' });
  });

  it.each([
    snapshot({ candidate: null }),
    snapshot({ journal: null }),
    snapshot({ primaryStatus: 'empty' }),
    snapshot({ activeSlot: { activeSlot: 'candidate', format: 'aurionxi-vault-active-slot-v1', transactionId: journal.transactionId } }),
    snapshot({ candidate: { ...candidate, publicAddress: '0x0000000000000000000000000000000000000002' } }),
  ])('fails closed for inconsistent state %#', async (value) => {
    const { executeDurablePromotionStep, result } = await run(value);
    expect(result).toEqual({ action: 'fail-closed', state: 'inconsistent' });
    expect(executeDurablePromotionStep).not.toHaveBeenCalled();
  });
});
