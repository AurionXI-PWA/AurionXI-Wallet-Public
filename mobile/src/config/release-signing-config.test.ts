import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const androidBuild = readFileSync(join(root, 'android/app/build.gradle'), 'utf8');
const androidIgnore = readFileSync(join(root, 'android/.gitignore'), 'utf8');
const exampleProperties = readFileSync(join(root, 'android/keystore.properties.example'), 'utf8');

describe('production signing configuration foundation', () => {
  it('loads release credentials only from an ignored local properties file', () => {
    expect(androidBuild).toContain("rootProject.file('keystore.properties')");
    expect(androidIgnore).toContain('keystore.properties');
  });

  it('uses release credentials for release artifacts and never falls back to debug signing', () => {
    expect(androidBuild).toContain('signingConfig signingConfigs.release');
    expect(androidBuild).not.toContain('signingConfig releaseKeystorePropertiesFile.exists() ? signingConfigs.release : signingConfigs.debug');
    expect(androidBuild).toContain('Release builds require ignored local keystore.properties; debug signing is not permitted.');
    expect(androidBuild).toContain('keystore.properties is missing:');
  });

  it('provides a secret-free local setup template', () => {
    expect(exampleProperties).toContain('keyAlias=YOUR_KEY_ALIAS');
    expect(exampleProperties).toContain('storeFile=/absolute/path/to/your-release-key.jks');
    expect(exampleProperties).toContain('storePassword=YOUR_KEYSTORE_PASSWORD');
    expect(exampleProperties).toContain('keyPassword=YOUR_KEY_PASSWORD');
    expect(exampleProperties).not.toContain('YOUR_KEYSTORE_PASSWORD'.replace('YOUR_', 'actual_'));
  });
});
