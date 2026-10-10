import { NativeModules } from 'react-native';

type NativeMigrationResult = Readonly<{ migrated: boolean; address: string }>;
type NativeVerificationResult = Readonly<{ verified: boolean; address: string }>;
type NativeVaultStatus = Readonly<{ present: boolean; address?: string | null }>;
type NativeMainnetSecurity = Readonly<{
  beginNativeMainnetVaultMigration: () => Promise<NativeMigrationResult>;
  verifyNativeMainnetVault: () => Promise<NativeVerificationResult>;
  getNativeMainnetVaultStatus: () => Promise<NativeVaultStatus>;
}>;

function requireNativeModule(): NativeMainnetSecurity {
  const module = NativeModules.AurionXIMainnetSecurity as NativeMainnetSecurity | undefined;
  if (!module?.beginNativeMainnetVaultMigration || !module?.verifyNativeMainnetVault || !module.getNativeMainnetVaultStatus) throw new Error('Native Mainnet vault migration is unavailable in this build.');
  return module;
}

/** Legacy envelope remains untouched; a failed migration cannot erase recovery material. */
export async function migrateMainnetVaultToNative(): Promise<{ address: `0x${string}` }> {
  const result = await requireNativeModule().beginNativeMainnetVaultMigration();
  if (!result.migrated || !/^0x[a-fA-F0-9]{40}$/.test(result.address)) throw new Error('Native Mainnet vault migration could not be verified.');
  return { address: result.address as `0x${string}` };
}
export async function getNativeMainnetVaultMigrationStatus(): Promise<NativeVaultStatus> { return requireNativeModule().getNativeMainnetVaultStatus(); }

/** Fresh biometric proof only. No key material, signature, or authorization reaches JavaScript. */
export async function verifyNativeMainnetVault(): Promise<{ address: `0x${string}` }> {
  const result = await requireNativeModule().verifyNativeMainnetVault();
  if (!result.verified || !/^0x[a-fA-F0-9]{40}$/.test(result.address)) throw new Error('Native Mainnet vault could not be verified.');
  return { address: result.address as `0x${string}` };
}
