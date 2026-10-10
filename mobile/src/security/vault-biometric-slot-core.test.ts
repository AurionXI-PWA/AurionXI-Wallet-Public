import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { VaultV3Envelope } from './vault-envelope-v3';
import {
  disableBiometricSlotSafely,
  enableBiometricSlotAtomically,
  replaceBiometricSlotAtomically,
  type EnableBiometricSlotDependencies,
} from './vault-biometric-slot-core';

const envelope = {
  format: 'aurionxi-vault-v3',
  pin: {},
} as VaultV3Envelope;
const keyId = 'a'.repeat(32);
const vaultKey = 'b'.repeat(64);
const wrappingKey = 'c'.repeat(64);
let dependencies: EnableBiometricSlotDependencies;

beforeEach(() => {
  dependencies = {
    deleteProtectedKey: vi.fn().mockResolvedValue(undefined),
    generateKeyId: vi.fn().mockResolvedValue(keyId),
    generateWrappingKeyHex: vi.fn().mockResolvedValue(wrappingKey),
    storeProtectedKey: vi.fn().mockResolvedValue(undefined),
    unwrapVaultKeyWithPin: vi.fn().mockResolvedValue(vaultKey),
    wrapVaultKeyForBiometric: vi.fn().mockResolvedValue('D'.repeat(40)),
    writeEnvelope: vi.fn().mockResolvedValue(undefined),
  };
});

describe('safe biometric slot removal', () => {
  const configured = {
    ...envelope,
    biometric: {
      keyId,
      scheme: 'aes-256-gcm+secure-store-v1' as const,
      wrappedVaultKey: 'D'.repeat(40),
    },
  };

  it('requires PIN verification before changing either storage boundary', async () => {
    await expect(disableBiometricSlotSafely(configured, false, dependencies)).rejects.toThrow(
      'PIN verification is required',
    );
    expect(dependencies.writeEnvelope).not.toHaveBeenCalled();
    expect(dependencies.deleteProtectedKey).not.toHaveBeenCalled();
  });

  it('removes the envelope reference before deleting its protected key', async () => {
    const events: string[] = [];
    vi.mocked(dependencies.writeEnvelope).mockImplementation(async () => { events.push('writeEnvelope'); });
    vi.mocked(dependencies.deleteProtectedKey).mockImplementation(async () => { events.push('deleteProtectedKey'); });
    const updated = await disableBiometricSlotSafely(configured, true, dependencies);
    expect(updated.biometric).toBeUndefined();
    expect(events).toEqual(['writeEnvelope', 'deleteProtectedKey']);
  });

  it('stays disabled if protected-key cleanup fails', async () => {
    vi.mocked(dependencies.deleteProtectedKey).mockRejectedValue(new Error('native cleanup failed'));
    const updated = await disableBiometricSlotSafely(configured, true, dependencies);
    expect(updated.biometric).toBeUndefined();
  });

  it('retains the configured slot if envelope persistence fails', async () => {
    vi.mocked(dependencies.writeEnvelope).mockRejectedValue(new Error('write failed'));
    await expect(disableBiometricSlotSafely(configured, true, dependencies)).rejects.toThrow('write failed');
    expect(dependencies.deleteProtectedKey).not.toHaveBeenCalled();
  });
});

describe('atomic biometric slot opt-in', () => {
  it('requires PIN verification before any key operation', async () => {
    await expect(enableBiometricSlotAtomically(envelope, '482905', false, dependencies)).rejects.toThrow(
      'PIN verification is required',
    );
    expect(dependencies.unwrapVaultKeyWithPin).not.toHaveBeenCalled();
  });

  it('stores a random protected key before publishing its envelope slot', async () => {
    const updated = await enableBiometricSlotAtomically(envelope, '482905', true, dependencies);
    expect(dependencies.storeProtectedKey).toHaveBeenCalledWith(keyId, wrappingKey);
    expect(dependencies.writeEnvelope).toHaveBeenCalledWith(updated);
    expect(updated.biometric).toMatchObject({ keyId, scheme: 'aes-256-gcm+secure-store-v1' });
  });

  it('removes an orphaned protected key when envelope persistence fails', async () => {
    vi.mocked(dependencies.writeEnvelope).mockRejectedValue(new Error('write failed'));
    await expect(enableBiometricSlotAtomically(envelope, '482905', true, dependencies)).rejects.toThrow(
      'write failed',
    );
    expect(dependencies.deleteProtectedKey).toHaveBeenCalledWith(keyId);
  });
});

describe('atomic biometric slot replacement', () => {
  const configured = {
    ...envelope,
    biometric: {
      keyId: 'e'.repeat(32),
      scheme: 'aes-256-gcm+secure-store-v1' as const,
      wrappedVaultKey: 'F'.repeat(40),
    },
  };

  it('publishes the replacement before removing the invalidated key', async () => {
    const events: string[] = [];
    vi.mocked(dependencies.storeProtectedKey).mockImplementation(async () => { events.push('store-new'); });
    vi.mocked(dependencies.writeEnvelope).mockImplementation(async () => { events.push('publish-new'); });
    vi.mocked(dependencies.deleteProtectedKey).mockImplementation(async () => { events.push('delete-old'); });

    const updated = await replaceBiometricSlotAtomically(configured, '482905', true, dependencies);
    expect(updated.biometric?.keyId).toBe(keyId);
    expect(events).toEqual(['store-new', 'publish-new', 'delete-old']);
    expect(dependencies.deleteProtectedKey).toHaveBeenCalledWith(configured.biometric.keyId);
  });

  it('keeps the old envelope and rolls back the replacement on publish failure', async () => {
    vi.mocked(dependencies.writeEnvelope).mockRejectedValue(new Error('publish failed'));
    await expect(
      replaceBiometricSlotAtomically(configured, '482905', true, dependencies),
    ).rejects.toThrow('publish failed');
    expect(dependencies.deleteProtectedKey).toHaveBeenCalledWith(keyId);
    expect(dependencies.deleteProtectedKey).not.toHaveBeenCalledWith(configured.biometric.keyId);
  });

  it('rejects duplicate key references before protected storage changes', async () => {
    vi.mocked(dependencies.generateKeyId).mockResolvedValue(configured.biometric.keyId);
    await expect(
      replaceBiometricSlotAtomically(configured, '482905', true, dependencies),
    ).rejects.toThrow('duplicate key reference');
    expect(dependencies.storeProtectedKey).not.toHaveBeenCalled();
  });
});
