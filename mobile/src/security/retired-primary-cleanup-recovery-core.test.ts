import { describe, expect, it, vi } from 'vitest';

import { createWalletIdentityRecord } from './wallet-identity-record-core';
import { createRetiredPrimaryCleanupJournal } from './retired-primary-cleanup-journal-core';
import { coordinateRetiredPrimaryCleanupRecovery } from './retired-primary-cleanup-recovery-core';

const journal = createRetiredPrimaryCleanupJournal(
  createWalletIdentityRecord(
    '0x0000000000000000000000000000000000000001',
    '2026-08-08T00:00:00.000Z',
  ),
  createWalletIdentityRecord(
    '0x0000000000000000000000000000000000000002',
    '2026-08-09T00:00:00.000Z',
  ),
  'present',
  '0123456789abcdef0123456789abcdef',
  '2026-08-09T00:02:00.000Z',
);

describe('retired primary cleanup recovery coordinator', () => {
  it('requires fresh authentication when no durable intent exists', async () => {
    const executeDurableCleanupStep = vi.fn();
    await expect(coordinateRetiredPrimaryCleanupRecovery({
      executeDurableCleanupStep,
      readCleanupJournal: vi.fn().mockResolvedValue(null),
    })).resolves.toEqual({ action: 'await-authenticated-cleanup', state: 'no-intent' });
    expect(executeDurableCleanupStep).not.toHaveBeenCalled();
  });

  it.each(['intent-recorded', 'primary-removed'] as const)(
    'advances exactly one durable recovery step from %s',
    async (phase) => {
      const executeDurableCleanupStep = vi.fn().mockResolvedValue(undefined);
      await expect(coordinateRetiredPrimaryCleanupRecovery({
        executeDurableCleanupStep,
        readCleanupJournal: vi.fn().mockResolvedValue({ ...journal, phase }),
      })).resolves.toEqual({ action: 'advance-durable-cleanup', state: 'recoverable' });
      expect(executeDurableCleanupStep).toHaveBeenCalledTimes(1);
    },
  );

  it('stops at finalized without invoking another cleanup step', async () => {
    const executeDurableCleanupStep = vi.fn();
    await expect(coordinateRetiredPrimaryCleanupRecovery({
      executeDurableCleanupStep,
      readCleanupJournal: vi.fn().mockResolvedValue({ ...journal, phase: 'finalized' }),
    })).resolves.toEqual({ action: 'complete', state: 'finalized' });
    expect(executeDurableCleanupStep).not.toHaveBeenCalled();
  });

  it('propagates executor failure without reporting unsafe success', async () => {
    const executeDurableCleanupStep = vi.fn().mockRejectedValue(new Error('inconsistent cleanup scope'));
    await expect(coordinateRetiredPrimaryCleanupRecovery({
      executeDurableCleanupStep,
      readCleanupJournal: vi.fn().mockResolvedValue(journal),
    })).rejects.toThrow('inconsistent cleanup scope');
    expect(executeDurableCleanupStep).toHaveBeenCalledTimes(1);
  });

  it('propagates journal storage failure without invoking the executor', async () => {
    const executeDurableCleanupStep = vi.fn();
    await expect(coordinateRetiredPrimaryCleanupRecovery({
      executeDurableCleanupStep,
      readCleanupJournal: vi.fn().mockRejectedValue(new Error('corrupt cleanup journal')),
    })).rejects.toThrow('corrupt cleanup journal');
    expect(executeDurableCleanupStep).not.toHaveBeenCalled();
  });

  it('exposes no storage mutation dependency other than the delegated durable step', () => {
    const dependencies = {
      executeDurableCleanupStep: vi.fn(),
      readCleanupJournal: vi.fn(),
    };
    expect(Object.keys(dependencies).sort()).toEqual([
      'executeDurableCleanupStep', 'readCleanupJournal',
    ]);
  });
});
