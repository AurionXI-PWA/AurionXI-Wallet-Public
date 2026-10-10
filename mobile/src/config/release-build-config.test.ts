import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const appConfig = JSON.parse(readFileSync(join(root, 'app.json'), 'utf8')) as {
  expo: { version: string };
};
const androidBuild = readFileSync(join(root, 'android/app/build.gradle'), 'utf8');

describe('V1.0 Android release configuration', () => {
  it('keeps the native version synchronized with the public V1.0 version', () => {
    expect(appConfig.expo.version).toBe('1.0.0');
    expect(androidBuild).toContain('versionCode 1');
    expect(androidBuild).toContain('versionName "1.0.0"');
  });

  it('does not treat the debug keystore as production signing readiness', () => {
    expect(androidBuild).toContain('signingConfig signingConfigs.debug');
    expect(androidBuild).toContain("def producesReleaseArtifact = lowerTaskName.contains('release') && !lowerTaskName.contains('clean')");
  });

  it('keeps ordinary builds closed and requires an ignored exact controlled-proof policy', () => {
    expect(androidBuild).toContain('buildConfigField "boolean", "CONTROLLED_PROOF_ENABLED", "false"');
    expect(androidBuild).toContain("def controlledProofPropertiesFile = rootProject.file('controlled-proof.properties')");
    expect(androidBuild).toContain("tasks.register('validateOfficialDirectControlledProofPolicy')");
    expect(androidBuild).toContain("def controlledProofArtifactTask = task.name ==~ /(?i)^(assemble|package|bundle|install|sign|publish|finalize).*OfficialDirectControlledProof.*/");
    expect(androidBuild).toContain('task.doFirst {\n            enforceOfficialDirectControlledProofPolicy()');
    expect(androidBuild).toContain('task.dependsOn(validateOfficialDirectControlledProofPolicy)');
    expect(androidBuild).not.toContain('gradle.startParameter.taskNames');
    expect(androidBuild).toContain("controlledProofAsset != 'arxi'");
    expect(androidBuild).toContain("controlledProofSender == controlledProofRecipient");
    expect(androidBuild).toContain("variant.buildType.name == 'controlledProof'");
    expect(androidBuild).toContain("variant.flavors*.name.contains('officialDirect')");
    expect(androidBuild).toContain("applicationIdSuffix '.controlledproof'");
    expect(androidBuild).toContain('signingConfig signingConfigs.debug');
    expect(androidBuild).toContain('new BigInteger(controlledProofExpiresAt) <= BigInteger.valueOf(System.currentTimeMillis())');
    expect(androidBuild).toContain("throw new GradleException('Controlled proof builds require a complete, enabled, exact ARXI policy");
    expect(androidBuild).toContain('buildConfigField "boolean", "DIRECT_MAINNET_PRODUCTION_ENABLED", "true"');
    expect(androidBuild).toContain('buildConfigField "String", "DIRECT_MAINNET_MAX_BNB_AMOUNT_WEI", \'"100000000000000000"\'');
    expect(androidBuild).toContain('buildConfigField "String", "DIRECT_MAINNET_MAX_ARXI_AMOUNT_WEI", \'"5000000000000000000000"\'');
    expect(androidBuild).toContain('buildConfigField "String", "DIRECT_MAINNET_MAX_FEE_WEI", \'"100000000000000"\'');
  });
});
