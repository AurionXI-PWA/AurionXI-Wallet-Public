import { describe, expect, it, vi } from 'vitest';

import { createWalletIdentityRecord } from './wallet-identity-record-core';
import { createWalletIdentityTransitionJournal } from './wallet-identity-transition-journal-core';
import { coordinateStartupWalletIdentityTransitionRecovery } from './wallet-identity-transition-recovery-core';

const journal = createWalletIdentityTransitionJournal(
  createWalletIdentityRecord(
    '0x0000000000000000000000000000000000000001',
    '2026-08-08T00:00:00.000Z',
  ),
  createWalletIdentityRecord(
    '0x0000000000000000000000000000000000000002',
    '2026-08-09T00:00:00.000Z',
  ),
  '0123456789abcdef0123456789abcdef',
  '2026-08-09T00:01:00.000Z',
);

describe('startup wallet identity transition recovery coordinator', () => {
  it('does nothing when no authenticated durable intent exists', async () => {
    const executeDurableTransitionStep = vi.fn();
    await expect(coordinateStartupWalletIdentityTransitionRecovery({
      executeDurableTransitionStep,
      readTransitionJournal: vi.fn().mockResolvedValue(null),
    })).resolves.toEqual({ action: 'none', state: 'clean' });
    expect(executeDurableTransitionStep).not.toHaveBeenCalled();
  });

  it.each(['intent-recorded', 'identity-written'] as const)(
    'advances exactly one durable step from %s',
    async (phase) => {
      const executeDurableTransitionStep = vi.fn().mockResolvedValue(undefined);
      await expect(coordinateStartupWalletIdentityTransitionRecovery({
        executeDurableTransitionStep,
        readTransitionJournal: vi.fn().mockResolvedValue({ ...journal, phase }),
      })).resolves.toEqual({ action: 'advance-durable-transition', state: 'recoverable' });
      expect(executeDurableTransitionStep).toHaveBeenCalledTimes(1);
    },
  );

  it('stops after identity verification without cleanup or deletion', async () => {
    const executeDurableTransitionStep = vi.fn();
    await expect(coordinateStartupWalletIdentityTransitionRecovery({
      executeDurableTransitionStep,
      readTransitionJournal: vi.fn().mockResolvedValue({
        ...journal,
        phase: 'identity-verified',
      }),
    })).resolves.toEqual({ action: 'await-finalization', state: 'identity-verified' });
    expect(executeDurableTransitionStep).not.toHaveBeenCalled();
  });

  it('propagates executor failure and never reports an unsafe success', async () => {
    const executeDurableTransitionStep = vi.fn().mockRejectedValue(new Error('inconsistent'));
    await expect(coordinateStartupWalletIdentityTransitionRecovery({
      executeDurableTransitionStep,
      readTransitionJournal: vi.fn().mockResolvedValue(journal),
    })).rejects.toThrow('inconsistent');
    expect(executeDurableTransitionStep).toHaveBeenCalledTimes(1);
  });

  it('propagates invalid journal storage failure without invoking the executor', async () => {
    const executeDurableTransitionStep = vi.fn();
    await expect(coordinateStartupWalletIdentityTransitionRecovery({
      executeDurableTransitionStep,
      readTransitionJournal: vi.fn().mockRejectedValue(new Error('corrupt journal')),
    })).rejects.toThrow('corrupt journal');
    expect(executeDurableTransitionStep).not.toHaveBeenCalled();
  });
});
