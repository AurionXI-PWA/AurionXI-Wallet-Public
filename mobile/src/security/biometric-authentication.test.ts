import { describe, expect, it, vi } from 'vitest';

import {
  BIOMETRIC_LOCKOUT_COOLDOWN_MS,
  BiometricPromptGate,
  mapBiometricAuthenticationResult,
} from './biometric-authentication-core';

describe('biometric result mapping', () => {
  it('maps successful authentication', () => {
    expect(mapBiometricAuthenticationResult({ success: true })).toBe('authenticated');
  });

  it.each(['user_cancel', 'app_cancel', 'system_cancel', 'user_fallback'] as const)(
    'maps %s to explicit PIN fallback',
    (error) => expect(mapBiometricAuthenticationResult({ success: false, error })).toBe('cancelled'),
  );

  it('distinguishes lockout and unavailable states', () => {
    expect(mapBiometricAuthenticationResult({ success: false, error: 'lockout' })).toBe('locked-out');
    expect(mapBiometricAuthenticationResult({ success: false, error: 'not_enrolled' })).toBe('unavailable');
  });

  it('fails closed for unclassified native errors', () => {
    expect(mapBiometricAuthenticationResult({ success: false, error: 'unknown' })).toBe('failed');
  });
});

describe('biometric prompt concurrency gate', () => {
  it('rejects an overlapping prompt without invoking native authentication twice', async () => {
    const gate = new BiometricPromptGate();
    let resolveFirst: ((value: 'authenticated') => void) | undefined;
    const authenticate = vi.fn(() => new Promise<'authenticated'>((resolve) => {
      resolveFirst = resolve;
    }));

    const first = gate.run(authenticate, 1_000);
    await expect(gate.run(authenticate, 1_000)).resolves.toBe('busy');
    expect(authenticate).toHaveBeenCalledOnce();
    resolveFirst?.('authenticated');
    await expect(first).resolves.toBe('authenticated');
  });

  it('starts a cooldown after native biometric lockout', async () => {
    const gate = new BiometricPromptGate();
    await expect(gate.run(async () => 'locked-out', 2_000)).resolves.toBe('locked-out');
    await expect(gate.run(async () => 'authenticated', 2_001)).resolves.toBe('cooldown');
    await expect(
      gate.run(async () => 'authenticated', 2_000 + BIOMETRIC_LOCKOUT_COOLDOWN_MS),
    ).resolves.toBe('authenticated');
  });

  it('maps thrown native errors to a closed failure and releases the gate', async () => {
    const gate = new BiometricPromptGate();
    await expect(gate.run(async () => { throw new Error('native failure'); })).resolves.toBe('failed');
    await expect(gate.run(async () => 'authenticated')).resolves.toBe('authenticated');
  });

  it('rejects a late native success after lifecycle invalidation', async () => {
    const gate = new BiometricPromptGate();
    let resolvePrompt: ((value: 'authenticated') => void) | undefined;
    const pending = gate.run(() => new Promise<'authenticated'>((resolve) => {
      resolvePrompt = resolve;
    }));
    gate.invalidate();
    resolvePrompt?.('authenticated');
    await expect(pending).resolves.toBe('session-invalidated');
  });
});
