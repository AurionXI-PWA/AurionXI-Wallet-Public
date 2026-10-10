import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const screen = readFileSync(resolve(__dirname, '../app/wallet/mainnet-unlock.tsx'), 'utf8');
const workflow = readFileSync(resolve(__dirname, 'mainnet-vault-biometric-workflow.ts'), 'utf8');
const native = readFileSync(resolve(__dirname, '../../android/app/src/main/java/com/aurionxi/wallet/mainnet/AurionXIMainnetSecurityModule.kt'), 'utf8');

describe('Mainnet unlock screen lifecycle wiring (source guards, not device tests)', () => {
  it('offers automatic biometric only after foreground/focus and retains explicit fingerprint/PIN choices', () => {
    expect(screen).toContain('autoPrompt.current.offer(foreground && screenFocused, busy)');
    expect(screen).toContain('void authenticate(\'biometric\');');
    expect(screen).toContain('onPress={() => void authenticate(\'biometric\')}');
    expect(screen).toContain("gate.current.begin(focused.current && appState.current === 'active')");
    expect(screen).toContain('Use PIN instead');
    expect(screen).toContain('keyboardShouldPersistTaps="handled"');
    expect(screen).toContain('flexGrow: 1');
  });
  it('retires on background, blur and timeout and checks late results before unlocking', () => {
    expect(screen).toContain("if (next === 'background') cancelAttempt()");
    expect(screen).toContain('focused.current = false; setScreenFocused(false); cancelAttempt()');
    expect(screen).toContain('MAINNET_UNLOCK_ATTEMPT_TIMEOUT_MS');
    expect(screen.indexOf('if (!isCurrent()) return')).toBeLessThan(screen.indexOf('unlock();'));
    expect(screen).toContain('zeroizeBytes(payload)');
    expect(screen).toContain('gate.current.retire(attempt)');
  });
  it('checks saved-state/resume/window focus natively without granting an authorization', () => {
    const method = native.slice(native.indexOf('fun isWalletAuthenticationHostReady'), native.indexOf('/** JS may request revocation'));
    expect(method).toContain('mainHandler.post');
    expect(method).toContain('Lifecycle.State.RESUMED');
    expect(method).toContain('!activity.supportFragmentManager.isStateSaved');
    expect(method).toContain('activity.hasWindowFocus()');
    expect(method).not.toContain('authorizationRegistry.');
  });
  it('guards both prompt boundaries and keeps protected-read custody until the worker settles', () => {
    expect(workflow).toContain('if (isCurrent) await requireMainnetUnlockHostReady(isCurrent)');
    expect(workflow).toContain('await requireStrongMainnetBiometric(isCurrent)');
    const readBoundary = workflow.slice(workflow.indexOf('let mainnetBiometricUnlockInFlight'));
    expect(readBoundary.indexOf('await requireMainnetUnlockHostReady(isCurrent)')).toBeLessThan(readBoundary.indexOf('await readMainnetBiometricWrappingKey'));
    expect(readBoundary).toContain("if (!isCurrent()) throw new MainnetBiometricWorkflowError('session-invalidated')");
    expect(readBoundary).toContain("if (mainnetBiometricUnlockInFlight) throw new MainnetBiometricWorkflowError('busy')");
    expect(readBoundary).toContain('return await decryptVaultV3Payload');
    expect(readBoundary).toContain('finally');
  });
});
