import type { CanonicalVaultMigrationLoadedStartScreenHarnessProps } from '@/components/canonical-vault-migration-loaded-start-screen-harness';

export type CanonicalVaultMigrationWriteFreeFixtureMode = 'loading' | 'unavailable';

export function getCanonicalVaultMigrationWriteFreeFixtureDependencies(
  mode: CanonicalVaultMigrationWriteFreeFixtureMode,
): CanonicalVaultMigrationLoadedStartScreenHarnessProps {
  return {
    authenticatePin: async () => { throw new Error('Synthetic fixture does not authenticate PIN.'); },
    loadEligibleSnapshot: () => (
      mode === 'loading'
        ? new Promise(() => undefined)
        : Promise.reject(new Error('Synthetic fixture storage safety check is unavailable.'))
    ),
  };
}
