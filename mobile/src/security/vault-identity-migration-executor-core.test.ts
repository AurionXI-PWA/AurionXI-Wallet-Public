import { describe, expect, it, vi } from 'vitest';

import type { VaultV3Envelope } from './vault-envelope-v3';
import { executeVaultIdentityMigration } from './vault-identity-migration-executor-core';
import {
  INITIAL_VAULT_IDENTITY_MIGRATION_STATE,
  transitionVaultIdentityMigration,
} from './vault-identity-migration-policy';
import type { WalletIdentityRecord } from './wallet-identity-record-core';

const vault = {
  createdAt: '2026-08-09T00:00:00.000Z',
  format: 'aurionxi-vault-v3',
  payloadCiphertext: 'C'.repeat(40),
  pin: { algorithm: 'argon2id', saltHex: '1'.repeat(32), wrappedVaultKey: 'D'.repeat(40) },
  publicAddress: '0x0000000000000000000000000000000000000001',
} satisfies VaultV3Envelope;
const missingIdentity = { action: 'require-pin-migration', state: 'missing-identity' } as const;

function authorized() {
  let state = transitionVaultIdentityMigration(INITIAL_VAULT_IDENTITY_MIGRATION_STATE, {
    audit: missingIdentity,
    type: 'BEGIN',
    vault,
  });
  state = transitionVaultIdentityMigration(state, { now: 100, type: 'PIN_VERIFIED' });
  return transitionVaultIdentityMigration(state, { confirmation: 'MIGRATE', now: 101, type: 'CONFIRM' });
}

function dependencies() {
  let identity: WalletIdentityRecord | null = null;
  return {
    deleteIdentity: vi.fn().mockImplementation(async () => { identity = null; }),
    getVaultStatus: vi.fn().mockResolvedValue('present' as const),
    readIdentity: vi.fn().mockImplementation(async () => identity),
    readVault: vi.fn().mockResolvedValue(vault),
    writeIdentity: vi.fn().mockImplementation(async (record: WalletIdentityRecord) => { identity = record; }),
  };
}

describe('read-back-verified wallet identity migration executor', () => {
  it('writes and verifies public identity without a vault mutation dependency', async () => {
    const deps = dependencies();
    await expect(executeVaultIdentityMigration(authorized(), deps, 102)).resolves.toEqual(
      expect.objectContaining({ publicAddress: vault.publicAddress, vaultCreatedAt: vault.createdAt }),
    );
    expect(deps.writeIdentity).toHaveBeenCalledOnce();
    expect(deps.deleteIdentity).not.toHaveBeenCalled();
    expect(Object.keys(deps)).not.toContain('writeVault');
    expect(Object.keys(deps)).not.toContain('deleteVault');
  });

  it.each(['empty', 'corrupt', 'unsupported'] as const)('rejects changed %s vault status before writing', async (status) => {
    const deps = dependencies();
    deps.getVaultStatus.mockResolvedValue(status);
    await expect(executeVaultIdentityMigration(authorized(), deps, 102)).rejects.toThrow('stale');
    expect(deps.writeIdentity).not.toHaveBeenCalled();
  });

  it('never overwrites or deletes an identity that appeared before execution', async () => {
    const deps = dependencies();
    deps.readIdentity.mockResolvedValue({
      derivationPath: "m/44'/60'/0'/0/0",
      format: 'aurionxi-wallet-identity-v1',
      publicAddress: vault.publicAddress,
      vaultCreatedAt: vault.createdAt,
    });
    await expect(executeVaultIdentityMigration(authorized(), deps, 102)).rejects.toThrow('stale');
    expect(deps.writeIdentity).not.toHaveBeenCalled();
    expect(deps.deleteIdentity).not.toHaveBeenCalled();
  });

  it('rejects changed vault scope before writing', async () => {
    const deps = dependencies();
    deps.readVault.mockResolvedValue({ ...vault, createdAt: '2026-08-09T00:00:01.000Z' });
    await expect(executeVaultIdentityMigration(authorized(), deps, 102)).rejects.toThrow('stale');
    expect(deps.writeIdentity).not.toHaveBeenCalled();
  });

  it('rolls back only the attempted identity after read-back mismatch', async () => {
    const deps = dependencies();
    deps.readIdentity
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        derivationPath: "m/44'/60'/0'/0/0",
        format: 'aurionxi-wallet-identity-v1',
        publicAddress: '0x0000000000000000000000000000000000000002',
        vaultCreatedAt: vault.createdAt,
      });
    await expect(executeVaultIdentityMigration(authorized(), deps, 102)).rejects.toThrow('read-back');
    expect(deps.deleteIdentity).toHaveBeenCalledOnce();
  });

  it('attempts identity-only rollback when the write rejects', async () => {
    const deps = dependencies();
    deps.writeIdentity.mockRejectedValue(new Error('write failed'));
    await expect(executeVaultIdentityMigration(authorized(), deps, 102)).rejects.toThrow('write failed');
    expect(deps.deleteIdentity).toHaveBeenCalledOnce();
  });

  it('rejects expired or incomplete authorization before writing', async () => {
    const deps = dependencies();
    await expect(executeVaultIdentityMigration(authorized(), deps, 60_100)).rejects.toThrow('expired');
    expect(deps.writeIdentity).not.toHaveBeenCalled();
  });
});
