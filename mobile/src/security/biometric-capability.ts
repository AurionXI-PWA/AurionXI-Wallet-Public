import * as LocalAuthentication from 'expo-local-authentication';

import {
  evaluateBiometricCapability,
  type BiometricCapability,
  type BiometricModality,
} from './biometric-capability-core';

export type { BiometricCapability } from './biometric-capability-core';

export type BiometricCapabilityDependencies = {
  getEnrolledLevel: () => Promise<LocalAuthentication.SecurityLevel>;
  hasHardware: () => Promise<boolean>;
  isEnrolled: () => Promise<boolean>;
  supportedTypes: () => Promise<LocalAuthentication.AuthenticationType[]>;
};

const nativeDependencies: BiometricCapabilityDependencies = {
  getEnrolledLevel: LocalAuthentication.getEnrolledLevelAsync,
  hasHardware: LocalAuthentication.hasHardwareAsync,
  isEnrolled: LocalAuthentication.isEnrolledAsync,
  supportedTypes: LocalAuthentication.supportedAuthenticationTypesAsync,
};

function mapModalities(types: LocalAuthentication.AuthenticationType[]): BiometricModality[] {
  const modalities: BiometricModality[] = [];
  if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
    modalities.push('fingerprint');
  }
  if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
    modalities.push('face');
  }
  if (types.includes(LocalAuthentication.AuthenticationType.IRIS)) modalities.push('iris');
  return modalities;
}

function mapSecurity(level: LocalAuthentication.SecurityLevel): BiometricCapability['security'] {
  if (level === LocalAuthentication.SecurityLevel.BIOMETRIC_STRONG) return 'biometric-strong';
  if (level === LocalAuthentication.SecurityLevel.BIOMETRIC_WEAK) return 'biometric-weak';
  if (level === LocalAuthentication.SecurityLevel.SECRET) return 'device-credential';
  return 'none';
}

export async function getBiometricCapability(
  dependencies = nativeDependencies,
): Promise<BiometricCapability> {
  const [hardwareAvailable, enrolled, types, enrolledLevel] = await Promise.all([
    dependencies.hasHardware(),
    dependencies.isEnrolled(),
    dependencies.supportedTypes(),
    dependencies.getEnrolledLevel(),
  ]);
  const security = mapSecurity(enrolledLevel);
  return evaluateBiometricCapability({
    enrolled,
    hardwareAvailable,
    modalities: mapModalities(types),
    security,
  });
}
