import type { CanonicalVaultMigrationPlan } from './canonical-vault-migration-policy';
import { decideCanonicalVaultMigrationStartup } from './canonical-vault-migration-startup-policy';
import { getCanonicalVaultMigrationStatusPresentation } from './canonical-vault-migration-status-presentation';

export async function loadCanonicalVaultMigrationStatus(
  readPlan: () => Promise<CanonicalVaultMigrationPlan>,
) {
  const decision = decideCanonicalVaultMigrationStartup(await readPlan());
  return {
    decision,
    presentation: getCanonicalVaultMigrationStatusPresentation(decision),
  };
}

