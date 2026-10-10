import { planCanonicalVaultMigration } from './canonical-vault-migration-policy';
import { readStoredCanonicalVaultMigrationSnapshot } from './canonical-vault-migration-snapshot';

export async function auditStoredCanonicalVaultMigration() {
  return planCanonicalVaultMigration(await readStoredCanonicalVaultMigrationSnapshot());
}

