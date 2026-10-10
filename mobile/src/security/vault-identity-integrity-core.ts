import type { VaultV3Envelope } from './vault-envelope-v3';
import type { VaultStatus } from './vault-store';
import type { WalletIdentityRecord } from './wallet-identity-record-core';

export type VaultIdentityIntegrityAudit = {
  action: 'none' | 'require-pin-migration' | 'preserve-identity' | 'block-recovery' | 'fail-closed';
  state:
    | 'clean-empty'
    | 'clean-bound'
    | 'missing-identity'
    | 'orphaned-identity'
    | 'identity-mismatch'
    | 'corrupt-vault-with-identity'
    | 'corrupt-vault-without-identity'
    | 'unsupported';
};

function matches(vault: VaultV3Envelope, identity: WalletIdentityRecord): boolean {
  return vault.createdAt === identity.vaultCreatedAt &&
    vault.publicAddress.toLowerCase() === identity.publicAddress.toLowerCase();
}

export function auditVaultIdentityIntegrity(
  vaultStatus: VaultStatus,
  vault: VaultV3Envelope | null,
  identity: WalletIdentityRecord | null,
): VaultIdentityIntegrityAudit {
  if (vaultStatus === 'unsupported') return { action: 'fail-closed', state: 'unsupported' };
  if (vaultStatus === 'empty') {
    return identity
      ? { action: 'fail-closed', state: 'orphaned-identity' }
      : { action: 'none', state: 'clean-empty' };
  }
  if (vaultStatus === 'corrupt') {
    return identity
      ? { action: 'preserve-identity', state: 'corrupt-vault-with-identity' }
      : { action: 'block-recovery', state: 'corrupt-vault-without-identity' };
  }
  if (!vault) return { action: 'fail-closed', state: 'identity-mismatch' };
  if (!identity) return { action: 'require-pin-migration', state: 'missing-identity' };
  return matches(vault, identity)
    ? { action: 'none', state: 'clean-bound' }
    : { action: 'fail-closed', state: 'identity-mismatch' };
}
