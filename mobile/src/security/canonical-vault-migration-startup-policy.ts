import type { CanonicalVaultMigrationPlan } from './canonical-vault-migration-policy';

export type CanonicalVaultMigrationStartupDecision =
  | {
      action: 'await-explicit-start';
      migrationAction: 'record-intent';
      state: 'ready';
    }
  | {
      action: 'recover-one-safe-step';
      migrationAction:
        | 'write-primary-copy'
        | 'mark-primary-written'
        | 'activate-primary-pointer'
        | 'mark-primary-authoritative'
        | 'mark-candidate-removed'
        | 'mark-finalized';
      state: 'recoverable';
    }
  | {
      action: 'require-explicit-candidate-removal';
      migrationAction: 'remove-candidate';
      state: 'approval-required';
    }
  | { action: 'report-complete'; state: 'finalized' }
  | { action: 'report-locked'; state: 'inconsistent' };

export function decideCanonicalVaultMigrationStartup(
  plan: CanonicalVaultMigrationPlan,
): CanonicalVaultMigrationStartupDecision {
  if (plan.action === 'record-intent') {
    return { action: 'await-explicit-start', migrationAction: plan.action, state: 'ready' };
  }
  if (plan.action === 'remove-candidate') {
    return {
      action: 'require-explicit-candidate-removal',
      migrationAction: plan.action,
      state: 'approval-required',
    };
  }
  if (plan.action === 'complete') return { action: 'report-complete', state: 'finalized' };
  if (plan.action === 'fail-closed') return { action: 'report-locked', state: 'inconsistent' };
  return {
    action: 'recover-one-safe-step',
    migrationAction: plan.action,
    state: 'recoverable',
  };
}

