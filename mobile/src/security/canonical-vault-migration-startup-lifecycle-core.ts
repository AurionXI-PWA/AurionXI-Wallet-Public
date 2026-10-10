import type { CanonicalVaultMigrationPlan } from './canonical-vault-migration-policy';
import {
  decideCanonicalVaultMigrationStartup,
  type CanonicalVaultMigrationStartupDecision,
} from './canonical-vault-migration-startup-policy';

type SafeStartupMigrationAction = Extract<
  CanonicalVaultMigrationStartupDecision,
  { action: 'recover-one-safe-step' }
>['migrationAction'];

export type CanonicalVaultMigrationStartupLifecycleDependencies = {
  readPlan: () => Promise<CanonicalVaultMigrationPlan>;
  recoverOneSafeStep: (action: SafeStartupMigrationAction) => Promise<void>;
};

const expectedNextAction: Record<SafeStartupMigrationAction, CanonicalVaultMigrationPlan['action']> = {
  'activate-primary-pointer': 'mark-primary-authoritative',
  'mark-candidate-removed': 'mark-finalized',
  'mark-finalized': 'complete',
  'mark-primary-authoritative': 'remove-candidate',
  'mark-primary-written': 'activate-primary-pointer',
  'write-primary-copy': 'mark-primary-written',
};

export async function runCanonicalVaultMigrationStartupLifecycle(
  dependencies: CanonicalVaultMigrationStartupLifecycleDependencies,
): Promise<
  | { action: 'recovered-one-safe-step'; next: CanonicalVaultMigrationStartupDecision; step: SafeStartupMigrationAction }
  | CanonicalVaultMigrationStartupDecision
> {
  const plan = await dependencies.readPlan();
  const decision = decideCanonicalVaultMigrationStartup(plan);
  if (decision.action !== 'recover-one-safe-step') return decision;

  await dependencies.recoverOneSafeStep(decision.migrationAction);
  const verifiedPlan = await dependencies.readPlan();
  if (verifiedPlan.action !== expectedNextAction[decision.migrationAction]) {
    throw new Error('Canonical migration startup recovery failed successor verification.');
  }
  return {
    action: 'recovered-one-safe-step',
    next: decideCanonicalVaultMigrationStartup(verifiedPlan),
    step: decision.migrationAction,
  };
}

