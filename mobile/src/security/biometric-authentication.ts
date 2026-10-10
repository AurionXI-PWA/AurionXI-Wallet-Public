import * as LocalAuthentication from 'expo-local-authentication';

import {
  mapBiometricAuthenticationResult,
  BiometricPromptGate,
  type BiometricAuthenticationOutcome,
} from './biometric-authentication-core';

export type { BiometricAuthenticationOutcome } from './biometric-authentication-core';

const promptGate = new BiometricPromptGate();
let authenticationEpoch = 0;

export function getBiometricAuthenticationEpoch(): number {
  return authenticationEpoch;
}

export function assertBiometricAuthenticationEpoch(expected: number): void {
  if (expected !== authenticationEpoch) {
    throw new Error('The biometric authentication session was invalidated.');
  }
}

export async function cancelActiveBiometricAuthentication(): Promise<void> {
  authenticationEpoch += 1;
  promptGate.invalidate();
  try {
    await LocalAuthentication.cancelAuthenticate();
  } catch {
    // Session invalidation is authoritative even if native cancellation is unavailable.
  }
}

export async function authenticateStrongBiometric(): Promise<BiometricAuthenticationOutcome> {
  return promptGate.run(async () => {
    const result = await LocalAuthentication.authenticateAsync({
      biometricsSecurityLevel: 'strong',
      cancelLabel: 'Use PIN',
      disableDeviceFallback: true,
      fallbackLabel: '',
      promptDescription: 'Verify your identity to unlock your wallet.',
      promptMessage: 'Unlock wallet',
      requireConfirmation: true,
    });
    return mapBiometricAuthenticationResult(result);
  });
}
