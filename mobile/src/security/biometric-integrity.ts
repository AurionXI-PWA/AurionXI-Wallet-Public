import { readBiometricKeyRegistry } from './biometric-key-store';
import { auditBiometricIntegrity } from './biometric-integrity-core';
import { readActiveVaultV3OrNull } from './vault-active-resolver';

export async function auditStoredBiometricIntegrity() {
  const [envelope, trackedKeyIds] = await Promise.all([
    readActiveVaultV3OrNull(),
    readBiometricKeyRegistry(),
  ]);
  return auditBiometricIntegrity({
    envelopeKeyId: envelope?.vault.biometric?.keyId ?? null,
    trackedKeyIds,
  });
}
