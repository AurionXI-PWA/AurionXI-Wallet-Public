import { describe, expect, it, vi } from 'vitest';

import { executeTestnetNamespaceMigrationWithBiometricReenrollment } from './testnet-vault-namespace-migration-executor';

const { authenticate, migrate, reenroll } = vi.hoisted(() => ({
  authenticate: vi.fn(), migrate: vi.fn(), reenroll: vi.fn(),
}));

vi.mock('./vault-workflow', () => ({ authenticateEncryptedVaultWithRetry: authenticate }));
vi.mock('./testnet-vault-namespace-migration-core', () => ({ migrateLegacyTestnetNamespace: migrate }));
vi.mock('./vault-biometric-workflow', () => ({ enableStoredVaultBiometrics: reenroll }));
vi.mock('./vault-store', () => ({ readLegacyVaultV3: vi.fn(), readTestnetVaultV3: vi.fn(), writeTestnetVaultV3: vi.fn() }));
vi.mock('./wallet-identity-record-store', () => ({ readLegacyWalletIdentityRecord: vi.fn(), readTestnetWalletIdentityRecord: vi.fn(), writeTestnetWalletIdentityRecord: vi.fn() }));

describe('Testnet namespace migration executor', () => {
  it('requires PIN authentication before migration and re-enrolls biometrics after it', async () => {
    migrate.mockResolvedValue({ migrated: true, legacyDeletionPermitted: false });
    await expect(executeTestnetNamespaceMigrationWithBiometricReenrollment('123456')).resolves.toEqual({ migrated: true, legacyDeletionPermitted: false });
    expect(authenticate).toHaveBeenCalledBefore(migrate);
    expect(migrate).toHaveBeenCalledBefore(reenroll);
    expect(reenroll).toHaveBeenCalledWith('123456');
  });
});
