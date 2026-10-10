import type { VaultV3Envelope } from './vault-envelope-v3';
import type { CreateVaultV3Input } from './vault-envelope-v3-core';
import type { VaultStatus } from './vault-store';
import {
  createWalletIdentityRecord,
  type WalletIdentityRecord,
} from './wallet-identity-record-core';

export type VaultIdentityEnrollmentDependencies = {
  createVault: (input: CreateVaultV3Input) => Promise<VaultV3Envelope>;
  deleteIdentity: () => Promise<void>;
  deleteVault: () => Promise<void>;
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

export async function enrollVaultIdentityAtomically(
  input: CreateVaultV3Input,
  dependencies: VaultIdentityEnrollmentDependencies,
): Promise<VaultV3Envelope> {
  const [vaultStatus, existingIdentity] = await Promise.all([
    dependencies.getVaultStatus(),
    dependencies.readIdentity(),
  ]);
  if (vaultStatus !== 'empty' || existingIdentity !== null) {
    throw new Error('Vault identity enrollment requires empty storage.');
  }

  let createdVault = false;
  let identityWriteAttempted = false;
  try {
    const vault = await dependencies.createVault(input);
    createdVault = true;
    const storedVault = await dependencies.readVault();
    if (
      !storedVault ||
      storedVault.createdAt !== vault.createdAt ||
      storedVault.publicAddress.toLowerCase() !== vault.publicAddress.toLowerCase()
    ) {
      throw new Error('The enrolled vault identity could not be bound to stored vault metadata.');
    }

    const identity = createWalletIdentityRecord(storedVault.publicAddress, storedVault.createdAt);
    identityWriteAttempted = true;
    await dependencies.writeIdentity(identity);
    const storedIdentity = await dependencies.readIdentity();
    if (!storedIdentity || !identityMatches(identity, storedIdentity)) {
      throw new Error('The authoritative wallet identity failed read-back verification.');
    }
    return vault;
  } catch (error) {
    if (identityWriteAttempted) {
      try {
        await dependencies.deleteIdentity();
      } catch {
        // A leftover identity blocks later enrollment and recovery fails closed.
      }
    }
    if (createdVault) {
      try {
        await dependencies.deleteVault();
      } catch {
        // A leftover encrypted vault blocks later enrollment. It is never overwritten.
      }
    }
    throw error;
  }
}
