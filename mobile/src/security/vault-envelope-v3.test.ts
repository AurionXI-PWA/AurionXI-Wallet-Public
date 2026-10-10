import { describe, expect, it } from 'vitest';

import { isVaultV3Envelope, type VaultV3Envelope } from './vault-envelope-v3';

const envelope: VaultV3Envelope = {
  createdAt: '2026-08-06T12:00:00.000Z',
  format: 'aurionxi-vault-v3',
  payloadCiphertext: 'A'.repeat(40),
  pin: {
    algorithm: 'argon2id',
    saltHex: '000102030405060708090a0b0c0d0e0f',
    wrappedVaultKey: 'B'.repeat(40),
  },
  publicAddress: '0x0000000000000000000000000000000000000001',
};

describe('v3 vault envelope validation', () => {
  it('accepts a complete versioned envelope', () => {
    expect(isVaultV3Envelope(envelope)).toBe(true);
  });

  it.each([
    { payloadCiphertext: '' },
    { pin: { ...envelope.pin, saltHex: '00' } },
    { pin: { ...envelope.pin, wrappedVaultKey: 'invalid!' } },
    { publicAddress: '0x1234' },
    { biometric: { keyId: '00', scheme: 'aes-256-gcm+secure-store-v1', wrappedVaultKey: 'C'.repeat(40) } },
  ])('rejects malformed or incomplete authenticated fields', (change) => {
    expect(isVaultV3Envelope({ ...envelope, ...change })).toBe(false);
  });

  it('accepts a complete biometric wrapping slot without changing the PIN slot', () => {
    expect(isVaultV3Envelope({
      ...envelope,
      biometric: {
        keyId: 'c'.repeat(32),
        scheme: 'aes-256-gcm+secure-store-v1',
        wrappedVaultKey: 'D'.repeat(40),
      },
    })).toBe(true);
  });
});
