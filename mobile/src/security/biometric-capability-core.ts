export type BiometricModality = 'face' | 'fingerprint' | 'iris';

export type BiometricCapability = {
  canOfferOptIn: boolean;
  enrolled: boolean;
  hardwareAvailable: boolean;
  modalities: BiometricModality[];
  security: 'none' | 'device-credential' | 'biometric-weak' | 'biometric-strong';
  status: 'unavailable' | 'not-enrolled' | 'weak-only' | 'strong-ready';
};

export type BiometricCapabilitySnapshot = {
  enrolled: boolean;
  hardwareAvailable: boolean;
  modalities: BiometricModality[];
  security: BiometricCapability['security'];
};

export function evaluateBiometricCapability(
  snapshot: BiometricCapabilitySnapshot,
): BiometricCapability {
  const strongReady =
    snapshot.hardwareAvailable &&
    snapshot.enrolled &&
    snapshot.security === 'biometric-strong';

  return {
    ...snapshot,
    canOfferOptIn: strongReady,
    status: !snapshot.hardwareAvailable
      ? 'unavailable'
      : !snapshot.enrolled
        ? 'not-enrolled'
        : strongReady
          ? 'strong-ready'
          : 'weak-only',
  };
}
