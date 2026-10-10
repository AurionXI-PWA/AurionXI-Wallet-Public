import { describe, expect, it, vi } from 'vitest';

import type { VaultV3Envelope } from './vault-envelope-v3';
import { enrollVaultIdentityAtomically } from './vault-identity-enrollment-core';

const input = {
  createdAt: '2026-08-09T00:00:00.000Z',
  payload: new Uint8Array([1, 2, 3]),
  pin: '246810',
  pinConfirmation: '246810',
  publicAddress: '0x0000000000000000000000000000000000000001' as const,
};
const vault = {
  createdAt: input.createdAt,
  format: 'aurionxi-vault-v3',
  payloadCiphertext: 'C'.repeat(40),
  pin: { algorithm: 'argon2id', saltHex: '1'.repeat(32), wrappedVaultKey: 'D'.repeat(40) },
  publicAddress: input.publicAddress,
} satisfies VaultV3Envelope;

function dependencies() {
  let identity: Awaited<ReturnType<ReturnType<typeof base>['readIdentity']>> = null;
  function base() {
    return {
      createVault: vi.fn().mockResolvedValue(vault),
      deleteIdentity: vi.fn().mockImplementation(async () => { identity = null; }),
      deleteVault: vi.fn().mockResolvedValue(undefined),
      getVaultStatus: vi.fn().mockResolvedValue('empty' as const),
      readIdentity: vi.fn().mockImplementation(async () => identity),
      readVault: vi.fn().mockResolvedValue(vault),
      writeIdentity: vi.fn().mockImplementation(async (record) => { identity = record; }),
    };
  }
  return base();
}

describe('atomic vault and authoritative identity enrollment', () => {
  it('commits and read-back verifies identity only after the vault is verified', async () => {
    const deps = dependencies();
    await expect(enrollVaultIdentityAtomically(input, deps)).resolves.toBe(vault);
    expect(deps.writeIdentity).toHaveBeenCalledWith(expect.objectContaining({
      publicAddress: vault.publicAddress,
      vaultCreatedAt: vault.createdAt,
    }));
    expect(deps.deleteIdentity).not.toHaveBeenCalled();
    expect(deps.deleteVault).not.toHaveBeenCalled();
  });

  it.each(['present', 'corrupt', 'unsupported'] as const)('never mutates non-empty %s vault storage', async (status) => {
    const deps = dependencies();
    deps.getVaultStatus.mockResolvedValue(status);
    await expect(enrollVaultIdentityAtomically(input, deps)).rejects.toThrow('empty storage');
    expect(deps.createVault).not.toHaveBeenCalled();
    expect(deps.writeIdentity).not.toHaveBeenCalled();
  });

  it('never overwrites or deletes a pre-existing identity', async () => {
    const deps = dependencies();
    deps.readIdentity.mockResolvedValue({
      derivationPath: "m/44'/60'/0'/0/0",
      format: 'aurionxi-wallet-identity-v1',
      publicAddress: vault.publicAddress,
      vaultCreatedAt: vault.createdAt,
    });
    await expect(enrollVaultIdentityAtomically(input, deps)).rejects.toThrow('empty storage');
    expect(deps.writeIdentity).not.toHaveBeenCalled();
    expect(deps.deleteIdentity).not.toHaveBeenCalled();
  });

  it('rolls back the new vault when stored vault metadata cannot be verified', async () => {
    const deps = dependencies();
    deps.readVault.mockResolvedValue(null);
    await expect(enrollVaultIdentityAtomically(input, deps)).rejects.toThrow('bound');
    expect(deps.writeIdentity).not.toHaveBeenCalled();
    expect(deps.deleteVault).toHaveBeenCalledOnce();
  });

  it('rolls back both new records after identity read-back mismatch', async () => {
    const deps = dependencies();
    deps.readIdentity
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        derivationPath: "m/44'/60'/0'/0/0",
        format: 'aurionxi-wallet-identity-v1',
        publicAddress: '0x0000000000000000000000000000000000000002',
        vaultCreatedAt: vault.createdAt,
      });
    await expect(enrollVaultIdentityAtomically(input, deps)).rejects.toThrow('read-back');
    expect(deps.deleteIdentity).toHaveBeenCalledOnce();
    expect(deps.deleteVault).toHaveBeenCalledOnce();
  });

  it('attempts safe rollback when identity write rejects', async () => {
    const deps = dependencies();
    deps.writeIdentity.mockRejectedValue(new Error('identity write failed'));
    await expect(enrollVaultIdentityAtomically(input, deps)).rejects.toThrow('identity write failed');
    expect(deps.deleteIdentity).toHaveBeenCalledOnce();
    expect(deps.deleteVault).toHaveBeenCalledOnce();
  });
});
