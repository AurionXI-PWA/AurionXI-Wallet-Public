import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createVaultV3WithDependencies,
  unlockVaultV3WithPin,
  type VaultV3Dependencies,
} from './vault-envelope-v3-core';

const metadata = {
  createdAt: '2026-08-06T12:00:00.000Z',
  publicAddress: '0x0000000000000000000000000000000000000001' as const,
};
const payload = new Uint8Array([1, 2, 3]);
const saltHex = '0'.repeat(32);
const vaultKeyHex = 'a'.repeat(64);
const wrappingKeyHex = 'b'.repeat(64);
let dependencies: VaultV3Dependencies;

beforeEach(() => {
  dependencies = {
    decryptPayload: vi.fn().mockResolvedValue(payload),
    derivePinWrappingKey: vi.fn().mockResolvedValue(wrappingKeyHex),
    encryptPayload: vi.fn().mockResolvedValue('C'.repeat(40)),
    generateSaltHex: vi.fn().mockResolvedValue(saltHex),
    generateVaultKeyHex: vi.fn().mockResolvedValue(vaultKeyHex),
    unwrapVaultKey: vi.fn().mockResolvedValue(vaultKeyHex),
    wrapVaultKey: vi.fn().mockResolvedValue('D'.repeat(40)),
  };
});

describe('v3 envelope-key workflow', () => {
  it('encrypts payload with a random vault key and wraps that key with the PIN key', async () => {
    const envelope = await createVaultV3WithDependencies({
      ...metadata,
      payload,
      pin: '482905',
      pinConfirmation: '482905',
    }, dependencies);

    expect(dependencies.encryptPayload).toHaveBeenCalledWith(payload, vaultKeyHex, metadata);
    expect(dependencies.wrapVaultKey).toHaveBeenCalledWith(vaultKeyHex, wrappingKeyHex, metadata);
    expect(envelope).toMatchObject({ format: 'aurionxi-vault-v3', pin: { saltHex } });
  });

  it('rejects invalid input before generating keys', async () => {
    await expect(createVaultV3WithDependencies({
      ...metadata,
      payload,
      pin: '123456',
      pinConfirmation: '123456',
    }, dependencies)).rejects.toThrow('harder to guess');
    expect(dependencies.generateVaultKeyHex).not.toHaveBeenCalled();
  });

  it('unwraps the vault key before decrypting the payload', async () => {
    const envelope = await createVaultV3WithDependencies({
      ...metadata,
      payload,
      pin: '482905',
      pinConfirmation: '482905',
    }, dependencies);
    await expect(unlockVaultV3WithPin(envelope, '482905', dependencies)).resolves.toEqual(payload);
    expect(dependencies.unwrapVaultKey).toHaveBeenCalledWith('D'.repeat(40), wrappingKeyHex, metadata);
    expect(dependencies.decryptPayload).toHaveBeenCalledWith('C'.repeat(40), vaultKeyHex, metadata);
  });

  it('never decrypts when key unwrapping fails', async () => {
    vi.mocked(dependencies.unwrapVaultKey).mockRejectedValue(new Error('authentication failed'));
    const envelope = await createVaultV3WithDependencies({
      ...metadata,
      payload,
      pin: '482905',
      pinConfirmation: '482905',
    }, dependencies);
    await expect(unlockVaultV3WithPin(envelope, '482905', dependencies)).rejects.toThrow('authentication failed');
    expect(dependencies.decryptPayload).not.toHaveBeenCalled();
  });
});
