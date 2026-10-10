import { auditVaultIdentityIntegrity } from './vault-identity-integrity-core';
import { readActiveVaultIdentitySnapshot } from './vault-active-identity-snapshot';
import { readWalletIdentityRecord } from './wallet-identity-record-store';

export async function auditStoredVaultIdentityIntegrity() {
  const snapshot = await readActiveVaultIdentitySnapshot();
  const identity = snapshot.status === 'unsupported' ? null : await readWalletIdentityRecord();
  return auditVaultIdentityIntegrity(snapshot.status, snapshot.vault, identity);
}
