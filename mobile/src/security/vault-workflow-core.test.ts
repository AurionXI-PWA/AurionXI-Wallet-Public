import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { EncryptedVaultEnvelope } from './vault-store';
import {
  createVaultWithDependencies,
  unlockVaultWithDependencies,
  type VaultWorkflowDependencies,
} from './vault-workflow-core';

const envelope: EncryptedVaultEnvelope = {
  ciphertext: 'A'.repeat(40),
  createdAt: '2026-08-06T15:00:00.000Z',
  format: 'aurionxi-vault-v2',
  kdf: { algorithm: 'argon2id', saltHex: '000102030405060708090a0b0c0d0e0f' },
  publicAddress: '0x0000000000000000000000000000000000000001',
};

const payload = new Uint8Array([1, 2, 3]);
let dependencies: VaultWorkflowDependencies;

beforeEach(() => {
  dependencies = {
    decrypt: vi.fn().mockResolvedValue(payload),
    derivePinKey: vi.fn().mockResolvedValue('a'.repeat(64)),
    encrypt: vi.fn().mockResolvedValue(envelope),
    generateSaltHex: vi.fn().mockResolvedValue(envelope.kdf.saltHex),
    read: vi.fn().mockResolvedValue(envelope),
    write: vi.fn().mockResolvedValue(undefined),
  };
});

describe('atomic vault workflow', () => {
  it('persists only after derivation and encryption complete', async () => {
    const events: string[] = [];
    vi.mocked(dependencies.derivePinKey).mockImplementation(async () => {
      events.push('derive');
      return 'a'.repeat(64);
    });
    vi.mocked(dependencies.encrypt).mockImplementation(async () => {
      events.push('encrypt');
      return envelope;
    });
    vi.mocked(dependencies.write).mockImplementation(async () => {
      events.push('write');
    });

    await createVaultWithDependencies(
      {
        createdAt: envelope.createdAt,
        payload,
        pin: '482905',
        pinConfirmation: '482905',
        publicAddress: envelope.publicAddress,
      },
      dependencies
    );

    expect(events).toEqual(['derive', 'encrypt', 'write']);
  });

  it('does not write when derivation or encryption fails', async () => {
    vi.mocked(dependencies.encrypt).mockRejectedValue(new Error('encryption failed'));
    await expect(
      createVaultWithDependencies(
        {
          createdAt: envelope.createdAt,
          payload,
          pin: '482905',
          pinConfirmation: '482905',
          publicAddress: envelope.publicAddress,
        },
        dependencies
      )
    ).rejects.toThrow('encryption failed');
    expect(dependencies.write).not.toHaveBeenCalled();
  });

  it('rejects an invalid PIN before invoking native dependencies', async () => {
    await expect(
      createVaultWithDependencies(
        {
          createdAt: envelope.createdAt,
          payload,
          pin: '123456',
          pinConfirmation: '123456',
          publicAddress: envelope.publicAddress,
        },
        dependencies
      )
    ).rejects.toThrow('harder to guess');
    expect(dependencies.generateSaltHex).not.toHaveBeenCalled();
  });

  it('reads, derives, and authenticates before returning plaintext', async () => {
    await expect(unlockVaultWithDependencies('482905', dependencies)).resolves.toEqual(payload);
    expect(dependencies.derivePinKey).toHaveBeenCalledWith('482905', envelope.kdf.saltHex);
    expect(dependencies.decrypt).toHaveBeenCalledWith(envelope, 'a'.repeat(64));
  });
});
