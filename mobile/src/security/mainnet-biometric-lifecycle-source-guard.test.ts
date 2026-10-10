import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Mainnet biometric lifecycle boundary', () => {
  it('revokes transfer authorization on a real background without removing the UI return grace', () => {
    const source = readFileSync(join(process.cwd(), 'src/security/mainnet-session-lock-provider.tsx'), 'utf8');
    expect(source).toContain("if (next === 'background')");
    expect(source).toContain("appStateRef.current !== 'background'");
    expect(source).toContain('invalidateAuthorization()');
    expect(source).toContain('cancelActiveBiometricAuthentication()');
    expect(source).not.toContain("previous === 'active' && next !== 'active'");
    expect(source).not.toContain("appStateRef.current === 'active'");
    const background = source.slice(source.indexOf("if (next === 'background')"), source.indexOf("if (previous !== 'active'"));
    expect(background).toContain('invalidateAuthorization()');
    expect(background).toContain('destroyActiveMainnetRecoverySecretSession()');
    expect(background).toContain("dispatchSession({ type: 'BACKGROUND'");
  });

  it('preserves Android-owned trusted UI during transient host pause', () => {
    const module = readFileSync(join(process.cwd(), 'android', 'app', 'src', 'main', 'java', 'com', 'aurionxi', 'wallet', 'mainnet', 'AurionXIMainnetSecurityModule.kt'), 'utf8');
    const onHostPause = module.slice(module.indexOf('override fun onHostPause()'), module.indexOf('override fun onHostDestroy()'));
    expect(onHostPause).toContain('if (!migrationController.isTrustedUiActive())');
    expect(onHostPause).toContain('val signingTrustedUi = signingController.isTrustedUiActive()');
    expect(onHostPause.indexOf('authorizationRegistry.invalidateAll()')).toBeGreaterThan(onHostPause.indexOf('if (!signingTrustedUi && !broadcastTrustedUi)'));
    expect(onHostPause).not.toContain('verificationController.cancelForLifecycle()');
  });

  it('registers and removes the process observer only on the Android main thread', () => {
    const module = readFileSync(join(process.cwd(), 'android', 'app', 'src', 'main', 'java', 'com', 'aurionxi', 'wallet', 'mainnet', 'AurionXIMainnetSecurityModule.kt'), 'utf8');
    expect(module).toContain('private val mainHandler = Handler(Looper.getMainLooper())');
    expect(module).toContain('mainHandler.post {');
    expect(module).toContain('processObserverRegistered.compareAndSet(false, true)');
    expect(module).toContain('processObserverRegistered.compareAndSet(true, false)');
    expect(module.indexOf('mainHandler.post {')).toBeLessThan(module.indexOf('ProcessLifecycleOwner.get().lifecycle.addObserver(processObserver)'));
  });
});
