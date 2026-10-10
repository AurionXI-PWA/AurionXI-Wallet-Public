import type { CanonicalVaultMigrationPlan } from './canonical-vault-migration-policy';

type ExecutableCanonicalMigrationAction = Exclude<
  CanonicalVaultMigrationPlan['action'],
  'complete' | 'fail-closed'
>;

export type CanonicalVaultMigrationRecoveryCoordinatorDependencies = {
  activatePrimaryPointer: () => Promise<void>;
  markCandidateRemoved: () => Promise<void>;
  markFinalized: () => Promise<void>;
  markPrimaryAuthoritative: () => Promise<void>;
  markPrimaryWritten: () => Promise<void>;
  readPlan: () => Promise<CanonicalVaultMigrationPlan>;
  recordIntent: () => Promise<void>;
  removeCandidate: () => Promise<void>;
  writePrimaryCopy: () => Promise<void>;
};

const expectedNextAction: Record<ExecutableCanonicalMigrationAction, CanonicalVaultMigrationPlan['action']> = {
  'activate-primary-pointer': 'mark-primary-authoritative',
  'mark-candidate-removed': 'mark-finalized',
  'mark-finalized': 'complete',
  'mark-primary-authoritative': 'remove-candidate',
  'mark-primary-written': 'activate-primary-pointer',
  'record-intent': 'write-primary-copy',
  'remove-candidate': 'mark-candidate-removed',
  'write-primary-copy': 'mark-primary-written',
};

async function executeOne(
  action: ExecutableCanonicalMigrationAction,
  dependencies: CanonicalVaultMigrationRecoveryCoordinatorDependencies,
): Promise<void> {
  switch (action) {
    case 'record-intent': return dependencies.recordIntent();
    case 'write-primary-copy': return dependencies.writePrimaryCopy();
    case 'mark-primary-written': return dependencies.markPrimaryWritten();
    case 'activate-primary-pointer': return dependencies.activatePrimaryPointer();
    case 'mark-primary-authoritative': return dependencies.markPrimaryAuthoritative();
    case 'remove-candidate': return dependencies.removeCandidate();
    case 'mark-candidate-removed': return dependencies.markCandidateRemoved();
    case 'mark-finalized': return dependencies.markFinalized();
  }
}

export async function recoverOneCanonicalVaultMigrationStep(
  dependencies: CanonicalVaultMigrationRecoveryCoordinatorDependencies,
): Promise<
  | { action: 'complete'; state: 'finalized' }
  | { action: 'executed-one-step'; step: ExecutableCanonicalMigrationAction }
> {
  const plan = await dependencies.readPlan();
  if (plan.action === 'fail-closed') {
    throw new Error('Canonical vault migration recovery failed closed.');
  }
  if (plan.action === 'complete') return { action: 'complete', state: 'finalized' };

  await executeOne(plan.action, dependencies);
  const verified = await dependencies.readPlan();
  if (verified.action !== expectedNextAction[plan.action]) {
    throw new Error('Canonical vault migration recovery failed next-step verification.');
  }
  return { action: 'executed-one-step', step: plan.action };
}

