import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const appConfig = JSON.parse(readFileSync(join(root, 'app.json'), 'utf8')) as {
  expo: { slug: string; android: { package: string } };
};
const androidBuild = readFileSync(join(root, 'android/app/build.gradle'), 'utf8');
const mainActivity = join(root, 'android/app/src/main/java/com/aurionxi/wallet/MainActivity.kt');
const mainApplication = join(root, 'android/app/src/main/java/com/aurionxi/wallet/MainApplication.kt');
const biometricStore = readFileSync(join(root, 'src/security/biometric-key-store.ts'), 'utf8');

describe('V1.0 production package migration', () => {
  it('uses the approved production application identity', () => {
    expect(appConfig.expo.slug).toBe('aurionxi-wallet');
    expect(appConfig.expo.android.package).toBe('com.aurionxi.wallet');
    expect(androidBuild).toContain("namespace 'com.aurionxi.wallet'");
    expect(androidBuild).toContain("applicationId 'com.aurionxi.wallet'");
  });

  it('moves the native entry points to the production package', () => {
    expect(existsSync(mainActivity)).toBe(true);
    expect(existsSync(mainApplication)).toBe(true);
    expect(readFileSync(mainActivity, 'utf8')).toContain('package com.aurionxi.wallet');
    expect(readFileSync(mainApplication, 'utf8')).toContain('package com.aurionxi.wallet');
  });

  it('uses a production-prefixed biometric service namespace', () => {
    expect(biometricStore).toContain('com.aurionxi.wallet.biometric-wrap');
    expect(biometricStore).not.toContain('com.aurionxi.wallet.beta');
  });
});
