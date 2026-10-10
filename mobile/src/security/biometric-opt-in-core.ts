import type { BiometricCapability } from './biometric-capability-core';

export type BiometricOptInState =
  | 'unavailable'
  | 'pin-verification-required'
  | 'ready-for-consent'
  | 'enabled'
  | 'enrollment-changed';

export type BiometricOptInSnapshot = {
  capability: BiometricCapability;
  optedIn: boolean;
  pinVerifiedThisSession: boolean;
  protectedMarker: 'not-checked' | 'valid' | 'missing-or-invalidated';
};

export type BiometricOptInDecision = {
  canRequestConsent: boolean;
  canUseBiometricUnlock: boolean;
  requiresPinFallback: boolean;
  state: BiometricOptInState;
};

export function evaluateBiometricOptIn(
  snapshot: BiometricOptInSnapshot,
): BiometricOptInDecision {
  if (!snapshot.capability.canOfferOptIn) {
    return {
      canRequestConsent: false,
      canUseBiometricUnlock: false,
      requiresPinFallback: snapshot.optedIn,
      state: 'unavailable',
    };
  }

  if (snapshot.optedIn && snapshot.protectedMarker === 'missing-or-invalidated') {
    return {
      canRequestConsent: false,
      canUseBiometricUnlock: false,
      requiresPinFallback: true,
      state: 'enrollment-changed',
    };
  }

  if (snapshot.optedIn) {
    return {
      canRequestConsent: false,
      canUseBiometricUnlock: snapshot.protectedMarker === 'valid',
      requiresPinFallback: snapshot.protectedMarker !== 'valid',
      state: 'enabled',
    };
  }

  if (!snapshot.pinVerifiedThisSession) {
    return {
      canRequestConsent: false,
      canUseBiometricUnlock: false,
      requiresPinFallback: true,
      state: 'pin-verification-required',
    };
  }

  return {
    canRequestConsent: true,
    canUseBiometricUnlock: false,
    requiresPinFallback: false,
    state: 'ready-for-consent',
  };
}
