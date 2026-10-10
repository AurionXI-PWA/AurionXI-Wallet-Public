import type { RetiredPrimaryCleanupJournal } from './retired-primary-cleanup-journal-core';
import type { RetiredPrimaryCleanupRecoveryResult } from './retired-primary-cleanup-recovery-core';

export type RetiredPrimaryCleanupStartupLifecycleDependencies = {
  readCleanupJournal: () => Promise<RetiredPrimaryCleanupJournal | null>;
  recoverOneCleanupStep: () => Promise<RetiredPrimaryCleanupRecoveryResult>;
};

export type RetiredPrimaryCleanupStartupLifecycleResult = {
  journalPhase: RetiredPrimaryCleanupJournal['phase'] | null;
  recovery: RetiredPrimaryCleanupRecoveryResult;
};

export async function runRetiredPrimaryCleanupStartupLifecycle(
  dependencies: RetiredPrimaryCleanupStartupLifecycleDependencies,
): Promise<RetiredPrimaryCleanupStartupLifecycleResult> {
  const recovery = await dependencies.recoverOneCleanupStep();
  const journal = await dependencies.readCleanupJournal();

  if (
    (recovery.action === 'await-authenticated-cleanup' && journal !== null) ||
    (recovery.action === 'advance-durable-cleanup' && journal === null) ||
    (recovery.action === 'complete' && journal?.phase !== 'finalized')
  ) {
    throw new Error('Retired primary cleanup lifecycle audit is inconsistent.');
  }

  return {
    journalPhase: journal?.phase ?? null,
    recovery,
  };
}
