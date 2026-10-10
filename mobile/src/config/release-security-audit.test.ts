import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const manifest = readFileSync(join(root, 'android/app/src/main/AndroidManifest.xml'), 'utf8');
const appConfig = readFileSync(join(root, 'app.json'), 'utf8');

describe('V1.0 Android release security baseline', () => {
  it('disables Android backup and blocks unnecessary storage, overlay, and vibration permissions', () => {
    expect(manifest).toContain('android:allowBackup="false"');
    for (const permission of [
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.READ_MEDIA_IMAGES',
      'android.permission.WRITE_EXTERNAL_STORAGE',
      'android.permission.SYSTEM_ALERT_WINDOW',
      'android.permission.VIBRATE',
    ]) {
      expect(manifest).toContain(`${permission}" tools:node="remove"`);
      expect(appConfig).toContain(permission);
    }
  });

  it('restricts the custom deep link to its explicit host and path and does not expose a mainnet feature configuration', () => {
    expect(manifest).toContain('<data android:scheme="${walletDeepLinkScheme}" android:host="wallet" android:pathPrefix="/open"/>');
    expect(appConfig).not.toMatch(/mainnet/i);
  });

  it('enables native Android sensitive-screen protection before React Native renders', () => {
    const activity = readFileSync(join(root, 'android/app/src/main/java/com/aurionxi/wallet/MainActivity.kt'), 'utf8');
    expect(activity).toMatch(/window\.setFlags\([\s\S]*?WindowManager\.LayoutParams\.FLAG_SECURE/);
  });

  it('hardens release artifacts with R8 and resource shrinking by default', () => {
    const gradle = readFileSync(join(root, 'android/app/build.gradle'), 'utf8');
    expect(gradle).toContain("findProperty('android.enableMinifyInReleaseBuilds') ?: 'true'");
    expect(gradle).toContain("findProperty('android.enableShrinkResourcesInReleaseBuilds') ?: 'true'");
  });
});
