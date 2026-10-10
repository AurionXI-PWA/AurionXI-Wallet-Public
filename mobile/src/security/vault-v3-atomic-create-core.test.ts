import { describe, expect, it, vi } from 'vitest';

import { createVaultV3Atomically } from './vault-v3-atomic-create-core';
import type { VaultV3Envelope } from './vault-envelope-v3';

const payload = new Uint8Array([1, 2, 3]);
const input = {
  createdAt: '2026-08-09T00:00:00.000Z',
  payload,
  pin: '246810',
  pinConfirmation: '246810',
  publicAddress: '0x0000000000000000000000000000000000000001' as const,
};
const envelope = {
  createdAt: input.createdAt,
  format: 'aurionxi-vault-v3',
  payloadCiphertext: 'A'.repeat(40),
  pin: {
    algorithm: 'argon2id',
    saltHex: '0'.repeat(32),
    wrappedVaultKey: 'B'.repeat(40),
  },
  publicAddress: input.publicAddress,
} satisfies VaultV3Envelope;

function dependencies() {
  return {
    build: vi.fn().mockResolvedValue(envelope),
    deleteStored: vi.fn().mockResolvedValue(undefined),
    getStatus: vi.fn().mockResolvedValue('empty' as const),
    read: vi.fn().mockResolvedValue(envelope),
    unlock: vi.fn().mockResolvedValue(Uint8Array.from(payload)),
    write: vi.fn().mockResolvedValue(undefined),
  };
}

describe('atomic verified v3 wallet creation', () => {
  it('writes, reads back, decrypts, and byte-verifies before success', async () => {
    const deps = dependencies();
    await expect(createVaultV3Atomically(input, deps)).resolves.toBe(envelope);
    expect(deps.build).toHaveBeenCalledWith(input);
    expect(deps.write).toHaveBeenCalledWith(envelope);
    expect(deps.unlock).toHaveBeenCalledWith(envelope, input.pin);
    expect(deps.deleteStored).not.toHaveBeenCalled();
  });

  it('blocks existing vaults before build or mutation', async () => {
    const deps = dependencies();
    deps.getStatus.mockResolvedValue('present');
    await expect(createVaultV3Atomically(input, deps)).rejects.toThrow('not empty');
    expect(deps.build).not.toHaveBeenCalled();
    expect(deps.write).not.toHaveBeenCalled();
    expect(deps.deleteStored).not.toHaveBeenCalled();
  });

  it.each(['corrupt', 'unsupported'] as const)('blocks %s storage without mutation', async (status) => {
    const deps = dependencies();
    deps.getStatus.mockResolvedValue(status);
    await expect(createVaultV3Atomically(input, deps)).rejects.toThrow('not empty');
    expect(deps.build).not.toHaveBeenCalled();
    expect(deps.write).not.toHaveBeenCalled();
    expect(deps.deleteStored).not.toHaveBeenCalled();
  });

  it('does not delete storage when the initial write fails', async () => {
    const deps = dependencies();
    deps.write.mockRejectedValue(new Error('write failed'));
    await expect(createVaultV3Atomically(input, deps)).rejects.toThrow('write failed');
    expect(deps.deleteStored).not.toHaveBeenCalled();
  });

  it('rolls back a newly written vault when read-back is missing', async () => {
    const deps = dependencies();
    deps.read.mockResolvedValue(null);
    await expect(createVaultV3Atomically(input, deps)).rejects.toThrow('read back');
    expect(deps.deleteStored).toHaveBeenCalledOnce();
  });

  it('rolls back plaintext mismatch and overwrites verified bytes', async () => {
    const deps = dependencies();
    const verified = new Uint8Array([1, 2, 4]);
    deps.unlock.mockResolvedValue(verified);
    await expect(createVaultV3Atomically(input, deps)).rejects.toThrow('plaintext verification');
    expect(deps.deleteStored).toHaveBeenCalledOnce();
    expect([...verified]).toEqual([0, 0, 0]);
  });

  it('preserves verification failure if rollback cleanup also fails', async () => {
    const deps = dependencies();
    deps.read.mockResolvedValue(null);
    deps.deleteStored.mockRejectedValue(new Error('delete failed'));
    await expect(createVaultV3Atomically(input, deps)).rejects.toThrow('read back');
  });
});
