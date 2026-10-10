import { CanonicalVaultMigrationStartScreenHarness } from '@/components/canonical-vault-migration-start-screen-harness';
import type { CanonicalVaultMigrationSnapshot } from '@/security/canonical-vault-migration-policy';
import { getCanonicalVaultMigrationRealPinHarnessDependencies } from '@/security/canonical-vault-migration-real-pin-harness-dependencies';

type CanonicalVaultMigrationRealPinStartScreenHarnessProps = {
  snapshot: CanonicalVaultMigrationSnapshot;
};

export function CanonicalVaultMigrationRealPinStartScreenHarness({
  snapshot,
}: CanonicalVaultMigrationRealPinStartScreenHarnessProps) {
  const { authenticatePin } = getCanonicalVaultMigrationRealPinHarnessDependencies();
  return (
    <CanonicalVaultMigrationStartScreenHarness
      authenticatePin={authenticatePin}
      snapshot={snapshot}
    />
  );
}
