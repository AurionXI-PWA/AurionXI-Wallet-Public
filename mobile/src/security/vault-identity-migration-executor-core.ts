import type { VaultV3Envelope } from './vault-envelope-v3';
import { auditVaultIdentityIntegrity } from './vault-identity-integrity-core';
import {
  canWriteMigratedWalletIdentity,
  type VaultIdentityMigrationState,
} from './vault-identity-migration-policy';
import type { VaultStatus } from './vault-store';
import {
  createWalletIdentityRecord,
  type WalletIdentityRecord,
} from './wallet-identity-record-core';

export type VaultIdentityMigrationExecutorDependencies = {
  deleteIdentity: () => Promise<void>;
  getVaultStatus: () => Promise<VaultStatus>;
  readIdentity: () => Promise<WalletIdentityRecord | null>;
  readVault: () => Promise<VaultV3Envelope | null>;
  writeIdentity: (record: WalletIdentityRecord) => Promise<void>;
};

function identityMatches(left: WalletIdentityRecord, right: WalletIdentityRecord): boolean {
  return left.format === right.format &&
    left.derivationPath === right.derivationPath &&
    left.vaultCreatedAt === right.vaultCreatedAt &&
    left.publicAddress.toLowerCase() === right.publicAddress.toLowerCase();
}

export async function executeVaultIdentityMigration(
  authorization: VaultIdentityMigrationState,
  dependencies: VaultIdentityMigrationExecutorDependencies,
  now = Date.now(),
): Promise<WalletIdentityRecord> {
  const [vaultStatus, existingIdentity] = await Promise.all([
    dependencies.getVaultStatus(),
    dependencies.readIdentity(),
  ]);
  const vault = vaultStatus === 'present' ? await dependencies.readVault() : null;
  const currentAudit = auditVaultIdentityIntegrity(vaultStatus, vault, existingIdentity);
  if (!canWriteMigratedWalletIdentity(authorization, currentAudit, vault, now)) {
    throw new Error('Wallet identity migration authorization is invalid, expired, or stale.');
  }
  if (!vault || existingIdentity) {
    throw new Error('Wallet identity migration requires a readable vault and empty identity slot.');
  }

  const identity = createWalletIdentityRecord(vault.publicAddress, vault.createdAt);
  let writeAttempted = false;
  try {
    writeAttempted = true;
    await dependencies.writeIdentity(identity);
    const storedIdentity = await dependencies.readIdentity();
    if (!storedIdentity || !identityMatches(identity, storedIdentity)) {
      throw new Error('Migrated wallet identity failed read-back verification.');
    }
    return storedIdentity;
  } catch (error) {
    if (writeAttempted) {
      try {
        await dependencies.deleteIdentity();
      } catch {
        // A leftover identity is detected by startup audit and fails closed.
      }
    }
    throw error;
  }
}
