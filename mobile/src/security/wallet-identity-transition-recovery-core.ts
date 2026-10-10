import type { WalletIdentityTransitionJournal } from './wallet-identity-transition-journal-core';

export type WalletIdentityTransitionRecoveryResult = {
  action: 'none' | 'advance-durable-transition' | 'await-finalization';
  state: 'clean' | 'recoverable' | 'identity-verified';
};

export type WalletIdentityTransitionRecoveryDependencies = {
  executeDurableTransitionStep: () => Promise<void>;
  readTransitionJournal: () => Promise<WalletIdentityTransitionJournal | null>;
};

export async function coordinateStartupWalletIdentityTransitionRecovery(
  dependencies: WalletIdentityTransitionRecoveryDependencies,
): Promise<WalletIdentityTransitionRecoveryResult> {
  const journal = await dependencies.readTransitionJournal();
  if (!journal) return { action: 'none', state: 'clean' };
  if (journal.phase === 'identity-verified') {
    return { action: 'await-finalization', state: 'identity-verified' };
  }
  await dependencies.executeDurableTransitionStep();
  return { action: 'advance-durable-transition', state: 'recoverable' };
}
