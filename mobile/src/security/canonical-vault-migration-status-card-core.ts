import type { CanonicalVaultMigrationStatusState } from './canonical-vault-migration-status-provider';

export type CanonicalVaultMigrationStatusCardModel =
  | { accessibilityLabel: 'Checking wallet storage safety'; state: 'checking' }
  | {
      blocksWallet: boolean;
      body: string;
      canReviewOptimization: boolean;
      requiresUserAction: boolean;
      severity: 'information' | 'warning' | 'critical' | 'success';
      state: 'visible';
      title: string;
    };

export function getCanonicalVaultMigrationStatusCardModel(
  status: CanonicalVaultMigrationStatusState,
): CanonicalVaultMigrationStatusCardModel {
  if (status.status === 'checking') {
    return { accessibilityLabel: 'Checking wallet storage safety', state: 'checking' };
  }
  return {
    blocksWallet: status.presentation.blocksWallet,
    body: status.presentation.body,
    canReviewOptimization:
      status.status === 'ready' &&
      status.decision.action === 'await-explicit-start' &&
      status.decision.migrationAction === 'record-intent' &&
      status.decision.state === 'ready',
    requiresUserAction: status.presentation.requiresUserAction,
    severity: status.presentation.severity,
    state: 'visible',
    title: status.presentation.title,
  };
}
