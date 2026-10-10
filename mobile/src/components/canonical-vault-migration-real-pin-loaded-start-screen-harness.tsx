import { useState } from 'react';

import {
  CanonicalVaultMigrationLoadedStartScreenHarness,
} from '@/components/canonical-vault-migration-loaded-start-screen-harness';
import { getCanonicalVaultMigrationRealPinHarnessDependencies } from '@/security/canonical-vault-migration-real-pin-harness-dependencies';

export function CanonicalVaultMigrationRealPinLoadedStartScreenHarness() {
  const [{ authenticatePin, loadEligibleSnapshot }] = useState(
    getCanonicalVaultMigrationRealPinHarnessDependencies,
  );
  return (
    <CanonicalVaultMigrationLoadedStartScreenHarness
      authenticatePin={authenticatePin}
      loadEligibleSnapshot={loadEligibleSnapshot}
    />
  );
}
