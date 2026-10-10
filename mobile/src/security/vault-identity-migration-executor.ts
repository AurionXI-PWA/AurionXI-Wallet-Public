import { executeVaultIdentityMigration } from './vault-identity-migration-executor-core';
import type { VaultIdentityMigrationState } from './vault-identity-migration-policy';
import { readActiveVaultIdentitySnapshot } from './vault-active-identity-snapshot';
import {
  deleteWalletIdentityRecord,
  readWalletIdentityRecord,
  writeWalletIdentityRecord,
} from './wallet-identity-record-store';

let migrationActive = false;

export async function executeAuthorizedWalletIdentityMigration(
  authorization: VaultIdentityMigrationState,
  now = Date.now(),
) {
  if (migrationActive) throw new Error('Wallet identity migration is already active.');
  migrationActive = true;
  try {
    const snapshotPromise = readActiveVaultIdentitySnapshot();
    return await executeVaultIdentityMigration(authorization, {
      deleteIdentity: deleteWalletIdentityRecord,
      getVaultStatus: async () => (await snapshotPromise).status,
      readIdentity: readWalletIdentityRecord,
      readVault: async () => (await snapshotPromise).vault,
      writeIdentity: writeWalletIdentityRecord,
    }, now);
  } finally {
    migrationActive = false;
  }
}
