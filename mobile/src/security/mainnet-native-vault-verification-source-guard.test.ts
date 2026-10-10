import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const MOBILE_ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const ANDROID_MAINNET_ROOT = join(MOBILE_ROOT, 'android', 'app', 'src', 'main', 'java', 'com', 'aurionxi', 'wallet', 'mainnet');
const android = (name: string) => readFileSync(join(ANDROID_MAINNET_ROOT, name), 'utf8');

describe('native Mainnet vault verification boundary', () => {
  it('requires a fresh biometric decrypt operation and returns no secret material', () => {
    const vault = android('MainnetNativeVaultMigration.kt');
    const controller = android('MainnetNativeVaultVerificationController.kt');
    expect(vault).toContain('prepareAuthenticatedVerificationCipher');
    expect(vault).toContain('Cipher.DECRYPT_MODE');
    expect(vault).toContain('entropy?.fill(0)');
    // The controller may describe security properties in prose, but must not
    // write vault records or invoke derivation APIs itself.
    expect(controller).not.toMatch(/putString\("entropy"|Credentials\.create|MnemonicUtils\.|deriveKeyPair/);
    expect(controller).toContain('putString("address", address)');
  });

  it('uses the reviewed coordinator without reviving PIN or JavaScript key access', () => {
    const screen = readFileSync(join(MOBILE_ROOT, 'src', 'app', 'wallet', 'mainnet-secure-confirm.tsx'), 'utf8');
    expect(screen).toContain('productionCoordinator.send(');
    expect(screen).toContain('getNativeMainnetVaultMigrationStatus');
    expect(screen).toContain('<Detail label="FROM" value={review.review.senderAddress} />');
    expect(screen).not.toContain('broadcastAfterExplicitApproval(');
    expect(screen).toContain("code === 'mainnet_native_signing_vault_unavailable'");
    expect(screen).not.toContain('TextInput');
    expect(screen).not.toMatch(/privateKey|mnemonic|recoveryPhrase|unlockMainnetVaultWithPin/);
  });

  it('fails closed instead of reviving the legacy JavaScript signer route', () => {
    const adapter = readFileSync(join(MOBILE_ROOT, 'src', 'security', 'mainnet-local-signer-adapter.ts'), 'utf8');
    expect(adapter).toContain('Legacy JavaScript Mainnet signing is permanently disabled.');
    expect(adapter).not.toContain('unlockMainnetVaultWithPin');
  });
});
