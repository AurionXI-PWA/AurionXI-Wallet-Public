import { describe, expect, it } from 'vitest';

import type { BiometricCapability } from './biometric-capability-core';
import { evaluateBiometricOptIn } from './biometric-opt-in-core';

const strongCapability: BiometricCapability = {
  canOfferOptIn: true,
  enrolled: true,
  hardwareAvailable: true,
  modalities: ['fingerprint'],
  security: 'biometric-strong',
  status: 'strong-ready',
};

describe('biometric opt-in policy', () => {
  it('fails closed when strong biometrics are unavailable', () => {
    expect(evaluateBiometricOptIn({
      capability: { ...strongCapability, canOfferOptIn: false, security: 'biometric-weak', status: 'weak-only' },
      optedIn: false,
      pinVerifiedThisSession: true,
      protectedMarker: 'not-checked',
    })).toEqual({
      canRequestConsent: false,
      canUseBiometricUnlock: false,
      requiresPinFallback: false,
      state: 'unavailable',
    });
  });

  it('requires PIN verification before consent', () => {
    expect(evaluateBiometricOptIn({
      capability: strongCapability,
      optedIn: false,
      pinVerifiedThisSession: false,
      protectedMarker: 'not-checked',
    }).state).toBe('pin-verification-required');
  });

  it('allows consent only after PIN verification', () => {
    expect(evaluateBiometricOptIn({
      capability: strongCapability,
      optedIn: false,
      pinVerifiedThisSession: true,
      protectedMarker: 'not-checked',
    })).toMatchObject({ canRequestConsent: true, state: 'ready-for-consent' });
  });

  it('allows biometric unlock only after its protected marker is validated', () => {
    expect(evaluateBiometricOptIn({
      capability: strongCapability,
      optedIn: true,
      pinVerifiedThisSession: false,
      protectedMarker: 'valid',
    })).toMatchObject({ canUseBiometricUnlock: true, state: 'enabled' });
  });

  it('forces PIN fallback when enrollment invalidates the marker', () => {
    expect(evaluateBiometricOptIn({
      capability: strongCapability,
      optedIn: true,
      pinVerifiedThisSession: false,
      protectedMarker: 'missing-or-invalidated',
    })).toEqual({
      canRequestConsent: false,
      canUseBiometricUnlock: false,
      requiresPinFallback: true,
      state: 'enrollment-changed',
    });
  });
});
