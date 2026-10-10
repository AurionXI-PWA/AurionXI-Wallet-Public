import { loadEligibleCanonicalVaultMigrationSnapshotWith } from './canonical-vault-migration-eligible-snapshot-loader-core';
import { readCanonicalVaultMigrationFreshnessWithTimeout } from './canonical-vault-migration-freshness-read-timeout-core';
import { readStoredCanonicalVaultMigrationSnapshot } from './canonical-vault-migration-snapshot';

export function loadStoredEligibleCanonicalVaultMigrationSnapshot(signal?: AbortSignal) {
  return readCanonicalVaultMigrationFreshnessWithTimeout(
    () => loadEligibleCanonicalVaultMigrationSnapshotWith(readStoredCanonicalVaultMigrationSnapshot),
    undefined,
    undefined,
    signal,
  );
}
