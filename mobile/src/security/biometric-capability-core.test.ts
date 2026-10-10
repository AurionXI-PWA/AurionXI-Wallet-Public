import { describe, expect, it } from 'vitest';

import {
  evaluateBiometricCapability,
  type BiometricCapabilitySnapshot,
} from './biometric-capability-core';

function snapshot(
  overrides: Partial<BiometricCapabilitySnapshot> = {},
): BiometricCapabilitySnapshot {
  return {
    enrolled: false,
    hardwareAvailable: false,
    modalities: [],
    security: 'none',
    ...overrides,
  };
}

describe('biometric capability policy', () => {
  it('fails closed when biometric hardware is unavailable', () => {
    expect(evaluateBiometricCapability(snapshot())).toMatchObject({
      canOfferOptIn: false,
      status: 'unavailable',
    });
  });

  it('requires biometric enrollment', () => {
    expect(
      evaluateBiometricCapability(
        snapshot({ hardwareAvailable: true, modalities: ['fingerprint'] }),
      ),
    ).toMatchObject({
      canOfferOptIn: false,
      modalities: ['fingerprint'],
      status: 'not-enrolled',
    });
  });

  it('does not offer opt-in for weak biometrics', () => {
    expect(
      evaluateBiometricCapability(
        snapshot({
          enrolled: true,
          hardwareAvailable: true,
          modalities: ['face'],
          security: 'biometric-weak',
        }),
      ),
    ).toMatchObject({
      canOfferOptIn: false,
      modalities: ['face'],
      status: 'weak-only',
    });
  });

  it('recognizes enrolled strong biometrics without enabling them', () => {
    expect(
      evaluateBiometricCapability(
        snapshot({
          enrolled: true,
          hardwareAvailable: true,
          modalities: ['fingerprint'],
          security: 'biometric-strong',
        }),
      ),
    ).toEqual({
      canOfferOptIn: true,
      enrolled: true,
      hardwareAvailable: true,
      modalities: ['fingerprint'],
      security: 'biometric-strong',
      status: 'strong-ready',
    });
  });
});
