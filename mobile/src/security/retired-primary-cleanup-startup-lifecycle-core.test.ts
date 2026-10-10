import { describe, expect, it, vi } from 'vitest';

import { createRetiredPrimaryCleanupJournal } from './retired-primary-cleanup-journal-core';
import type { RetiredPrimaryCleanupRecoveryResult } from './retired-primary-cleanup-recovery-core';
import { runRetiredPrimaryCleanupStartupLifecycle } from './retired-primary-cleanup-startup-lifecycle-core';
import { createWalletIdentityRecord } from './wallet-identity-record-core';

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

describe('retired primary cleanup startup lifecycle', () => {
  it('runs exactly one recovery decision before a fresh durable journal audit', async () => {
    const calls: string[] = [];
    const result = await runRetiredPrimaryCleanupStartupLifecycle({
      readCleanupJournal: vi.fn(async () => {
        calls.push('audit');
        return journal;
      }),
      recoverOneCleanupStep: vi.fn(async (): Promise<RetiredPrimaryCleanupRecoveryResult> => {
        calls.push('recover');
        return { action: 'advance-durable-cleanup', state: 'recoverable' };
      }),
    });
    expect(calls).toEqual(['recover', 'audit']);
    expect(result).toEqual({
      journalPhase: 'intent-recorded',
      recovery: { action: 'advance-durable-cleanup', state: 'recoverable' },
    });
  });

  it('preserves the authenticated boundary when no durable intent exists', async () => {
    const recoverOneCleanupStep = vi.fn().mockResolvedValue({
      action: 'await-authenticated-cleanup',
      state: 'no-intent',
    });
    await expect(runRetiredPrimaryCleanupStartupLifecycle({
      readCleanupJournal: vi.fn().mockResolvedValue(null),
      recoverOneCleanupStep,
    })).resolves.toEqual({
      journalPhase: null,
      recovery: { action: 'await-authenticated-cleanup', state: 'no-intent' },
    });
    expect(recoverOneCleanupStep).toHaveBeenCalledTimes(1);
  });

  it('reports completion only after a fresh finalized read-back', async () => {
    await expect(runRetiredPrimaryCleanupStartupLifecycle({
      readCleanupJournal: vi.fn().mockResolvedValue({ ...journal, phase: 'finalized' }),
      recoverOneCleanupStep: vi.fn().mockResolvedValue({ action: 'complete', state: 'finalized' }),
    })).resolves.toEqual({
      journalPhase: 'finalized',
      recovery: { action: 'complete', state: 'finalized' },
    });
  });

  it.each([
    {
      journal,
      recovery: { action: 'await-authenticated-cleanup', state: 'no-intent' } as const,
    },
    {
      journal: null,
      recovery: { action: 'advance-durable-cleanup', state: 'recoverable' } as const,
    },
    {
      journal: { ...journal, phase: 'primary-removed' as const },
      recovery: { action: 'complete', state: 'finalized' } as const,
    },
  ])('fails closed for an impossible post-recovery audit %#', async ({ journal: stored, recovery }) => {
    await expect(runRetiredPrimaryCleanupStartupLifecycle({
      readCleanupJournal: vi.fn().mockResolvedValue(stored),
      recoverOneCleanupStep: vi.fn().mockResolvedValue(recovery),
    })).rejects.toThrow('audit is inconsistent');
  });

  it('does not publish an audit when recovery fails', async () => {
    const readCleanupJournal = vi.fn();
    await expect(runRetiredPrimaryCleanupStartupLifecycle({
      readCleanupJournal,
      recoverOneCleanupStep: vi.fn().mockRejectedValue(new Error('cleanup scope changed')),
    })).rejects.toThrow('cleanup scope changed');
    expect(readCleanupJournal).not.toHaveBeenCalled();
  });
});
