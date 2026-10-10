/// <reference types="node" />

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const MOBILE_ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const ANDROID_MAINNET_ROOT = join(MOBILE_ROOT, 'android/app/src/main/java/com/aurionxi/wallet/mainnet');

function androidSource(name: string): string {
  return readFileSync(join(ANDROID_MAINNET_ROOT, name), 'utf8');
}

describe('native Mainnet migration lifecycle boundary', () => {
  it('routes migration through the lifecycle-bound native controller', () => {
    const module = androidSource('AurionXIMainnetSecurityModule.kt');
    expect(module).toContain('migrationController.begin');
    expect(module).toContain('migrationController.cancelForLifecycle()');
    expect(module).not.toContain('migrationInProgress');
    expect(module).not.toContain('input.text?.toString()');
  });

  it('keeps one operation active until cancellation or completion checkpoints settle it', () => {
    const controller = androidSource('MainnetNativeMigrationController.kt');
    expect(controller).toContain('Executors.newSingleThreadExecutor');
    expect(controller).toContain('active != null');
    expect(controller).toContain('cancelForLifecycle');
    expect(controller).toContain('fun isTrustedUiActive()');
    expect(controller).toContain('operation.activity.runOnUiThread');
    expect(controller).toContain('requireCurrent(operation)');
    expect(controller).toContain('editable.clear()');
    expect(controller).toContain("pin.fill('\\u0000')");
  });

  it('keeps legacy recovery material retained during this phase', () => {
    const migration = androidSource('MainnetNativeVaultMigration.kt');
    expect(migration).toContain('MIGRATION_STATE_NATIVE_WRITTEN_LEGACY_RETAINED');
    expect(migration).not.toContain('deleteItemAsync');
    expect(migration).toContain('native_vault_address_conflict');
  });
});
