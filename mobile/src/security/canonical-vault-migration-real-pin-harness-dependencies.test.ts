import { describe, expect, it, vi } from 'vitest';

import { getCanonicalVaultMigrationRealPinHarnessDependencies } from './canonical-vault-migration-real-pin-harness-dependencies';

const mocks = vi.hoisted(() => ({
  authenticateCanonicalVaultMigrationPin: vi.fn(),
  loadStoredEligibleCanonicalVaultMigrationSnapshot: vi.fn(),
}));

vi.mock('./canonical-vault-migration-pin-verifier', () => ({
  authenticateCanonicalVaultMigrationPin: mocks.authenticateCanonicalVaultMigrationPin,
}));

vi.mock('./canonical-vault-migration-eligible-snapshot-loader', () => ({
  loadStoredEligibleCanonicalVaultMigrationSnapshot: mocks.loadStoredEligibleCanonicalVaultMigrationSnapshot,
}));

describe('canonical migration unmounted real-verifier harness injection foundation', () => {
  it('returns only the real abort-aware verifier dependency', () => {
    expect(getCanonicalVaultMigrationRealPinHarnessDependencies()).toEqual({
      authenticatePin: mocks.authenticateCanonicalVaultMigrationPin,
      loadEligibleSnapshot: mocks.loadStoredEligibleCanonicalVaultMigrationSnapshot,
    });
  });

  it('does not invoke the verifier while creating dependencies', () => {
    getCanonicalVaultMigrationRealPinHarnessDependencies();
    expect(mocks.authenticateCanonicalVaultMigrationPin).not.toHaveBeenCalled();
    expect(mocks.loadStoredEligibleCanonicalVaultMigrationSnapshot).not.toHaveBeenCalled();
  });

  it('contains no router, executor, writer, or navigation dependency', () => {
    const dependencies = getCanonicalVaultMigrationRealPinHarnessDependencies();
    expect(Object.keys(dependencies).sort()).toEqual(['authenticatePin', 'loadEligibleSnapshot']);
    expect(dependencies).not.toHaveProperty('navigate');
    expect(dependencies).not.toHaveProperty('executeIntent');
    expect(dependencies).not.toHaveProperty('write');
  });
});
