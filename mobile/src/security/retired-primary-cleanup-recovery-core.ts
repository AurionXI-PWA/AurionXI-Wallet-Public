import type { RetiredPrimaryCleanupJournal } from './retired-primary-cleanup-journal-core';

export type RetiredPrimaryCleanupRecoveryResult = {
  action: 'await-authenticated-cleanup' | 'advance-durable-cleanup' | 'complete';
  state: 'no-intent' | 'recoverable' | 'finalized';
};

export type RetiredPrimaryCleanupRecoveryDependencies = {
  executeDurableCleanupStep: () => Promise<void>;
  readCleanupJournal: () => Promise<RetiredPrimaryCleanupJournal | null>;
};

export async function coordinateRetiredPrimaryCleanupRecovery(
  dependencies: RetiredPrimaryCleanupRecoveryDependencies,
): Promise<RetiredPrimaryCleanupRecoveryResult> {
  const journal = await dependencies.readCleanupJournal();
  if (!journal) {
    return { action: 'await-authenticated-cleanup', state: 'no-intent' };
  }
  if (journal.phase === 'finalized') {
    return { action: 'complete', state: 'finalized' };
  }
  await dependencies.executeDurableCleanupStep();
  return { action: 'advance-durable-cleanup', state: 'recoverable' };
}
