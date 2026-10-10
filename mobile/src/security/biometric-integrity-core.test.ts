import { describe, expect, it } from 'vitest';

import { auditBiometricIntegrity } from './biometric-integrity-core';

const active = 'a'.repeat(32);
const orphan = 'b'.repeat(32);

describe('startup biometric integrity audit', () => {
  it('allows biometric unlock only when the envelope reference is tracked', () => {
    expect(auditBiometricIntegrity({ envelopeKeyId: active, trackedKeyIds: [active] })).toEqual({
      biometricUnlockAllowed: true,
      orphanedKeyIds: [],
      state: 'consistent',
    });
  });

  it('fails closed when an envelope slot has no tracked protected key', () => {
    expect(auditBiometricIntegrity({ envelopeKeyId: active, trackedKeyIds: [] })).toMatchObject({
      biometricUnlockAllowed: false,
      state: 'missing-tracking',
    });
  });

  it('detects orphaned keys without opening a biometric prompt', () => {
    expect(auditBiometricIntegrity({ envelopeKeyId: active, trackedKeyIds: [active, orphan] })).toEqual({
      biometricUnlockAllowed: true,
      orphanedKeyIds: [orphan],
      state: 'orphaned-keys',
    });
  });

  it('normalizes duplicate and malformed metadata', () => {
    expect(auditBiometricIntegrity({ envelopeKeyId: null, trackedKeyIds: [orphan, orphan, 'bad'] })).toEqual({
      biometricUnlockAllowed: false,
      orphanedKeyIds: [orphan],
      state: 'orphaned-keys',
    });
  });
});
