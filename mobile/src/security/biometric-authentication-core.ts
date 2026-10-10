import type * as LocalAuthentication from 'expo-local-authentication';

export type BiometricAuthenticationOutcome =
  | 'authenticated'
  | 'cancelled'
  | 'locked-out'
  | 'busy'
  | 'cooldown'
  | 'session-invalidated'
  | 'unavailable'
  | 'failed';

export const BIOMETRIC_LOCKOUT_COOLDOWN_MS = 30_000;

export class BiometricPromptGate {
  private active = false;
  private blockedUntil = 0;
  private generation = 0;

  invalidate(): void {
    this.generation += 1;
  }

  async run(
    authenticate: () => Promise<BiometricAuthenticationOutcome>,
    now = Date.now(),
  ): Promise<BiometricAuthenticationOutcome> {
    if (this.active) return 'busy';
    if (now < this.blockedUntil) return 'cooldown';

    this.active = true;
    const startedGeneration = this.generation;
    try {
      const outcome = await authenticate();
      if (startedGeneration !== this.generation) return 'session-invalidated';
      if (outcome === 'locked-out') {
        this.blockedUntil = now + BIOMETRIC_LOCKOUT_COOLDOWN_MS;
      }
      return outcome;
    } catch {
      return 'failed';
    } finally {
      this.active = false;
    }
  }
}

export function mapBiometricAuthenticationResult(
  result: LocalAuthentication.LocalAuthenticationResult,
): BiometricAuthenticationOutcome {
  if (result.success) return 'authenticated';
  if (['user_cancel', 'app_cancel', 'system_cancel', 'user_fallback'].includes(result.error)) {
    return 'cancelled';
  }
  if (result.error === 'lockout') return 'locked-out';
  if (['not_available', 'not_enrolled', 'passcode_not_set'].includes(result.error)) {
    return 'unavailable';
  }
  return 'failed';
}
