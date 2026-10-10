import type { VaultV3Envelope } from './vault-envelope-v3';

export type EnableBiometricSlotDependencies = {
  deleteProtectedKey: (keyId: string) => Promise<void>;
  generateKeyId: () => Promise<string>;
  generateWrappingKeyHex: () => Promise<string>;
  storeProtectedKey: (keyId: string, wrappingKeyHex: string) => Promise<void>;
  unwrapVaultKeyWithPin: (envelope: VaultV3Envelope, pin: string) => Promise<string>;
  wrapVaultKeyForBiometric: (
    vaultKeyHex: string,
    wrappingKeyHex: string,
    keyId: string,
  ) => Promise<string>;
  writeEnvelope: (envelope: VaultV3Envelope) => Promise<void>;
};

export async function enableBiometricSlotAtomically(
  envelope: VaultV3Envelope,
  pin: string,
  pinVerifiedThisSession: boolean,
  dependencies: EnableBiometricSlotDependencies,
): Promise<VaultV3Envelope> {
  if (!pinVerifiedThisSession) throw new Error('PIN verification is required before biometric opt-in.');
  if (envelope.biometric) throw new Error('Biometric opt-in is already configured.');

  const vaultKeyHex = await dependencies.unwrapVaultKeyWithPin(envelope, pin);
  const [keyId, wrappingKeyHex] = await Promise.all([
    dependencies.generateKeyId(),
    dependencies.generateWrappingKeyHex(),
  ]);
  const wrappedVaultKey = await dependencies.wrapVaultKeyForBiometric(
    vaultKeyHex,
    wrappingKeyHex,
    keyId,
  );

  let protectedKeyStored = false;
  try {
    await dependencies.storeProtectedKey(keyId, wrappingKeyHex);
    protectedKeyStored = true;
    const updated: VaultV3Envelope = {
      ...envelope,
      biometric: {
        keyId,
        scheme: 'aes-256-gcm+secure-store-v1',
        wrappedVaultKey,
      },
    };
    await dependencies.writeEnvelope(updated);
    return updated;
  } catch (error) {
    if (protectedKeyStored) {
      try {
        await dependencies.deleteProtectedKey(keyId);
      } catch {
        // No envelope references the orphaned key; PIN access remains authoritative.
      }
    }
    throw error;
  }
}

export type DisableBiometricSlotDependencies = {
  deleteProtectedKey: (keyId: string) => Promise<void>;
  writeEnvelope: (envelope: VaultV3Envelope) => Promise<void>;
};

export async function disableBiometricSlotSafely(
  envelope: VaultV3Envelope,
  pinVerifiedThisSession: boolean,
  dependencies: DisableBiometricSlotDependencies,
): Promise<VaultV3Envelope> {
  if (!pinVerifiedThisSession) throw new Error('PIN verification is required before biometric removal.');
  if (!envelope.biometric) throw new Error('Biometric unlock is not configured.');

  const keyId = envelope.biometric.keyId;
  const { biometric: _removed, ...withoutBiometric } = envelope;
  const updated: VaultV3Envelope = withoutBiometric;

  // Remove the usable envelope reference first. If protected-key deletion
  // later fails, only an unreachable orphan remains and PIN stays authoritative.
  await dependencies.writeEnvelope(updated);
  try {
    await dependencies.deleteProtectedKey(keyId);
  } catch {
    // Fail safe: biometric unlock is already disabled by the persisted envelope.
  }
  return updated;
}

export async function replaceBiometricSlotAtomically(
  envelope: VaultV3Envelope,
  pin: string,
  pinVerifiedThisSession: boolean,
  dependencies: EnableBiometricSlotDependencies,
): Promise<VaultV3Envelope> {
  if (!pinVerifiedThisSession) throw new Error('PIN verification is required before biometric re-enrollment.');
  if (!envelope.biometric) throw new Error('Biometric unlock is not configured.');

  const previousKeyId = envelope.biometric.keyId;
  const vaultKeyHex = await dependencies.unwrapVaultKeyWithPin(envelope, pin);
  const [keyId, wrappingKeyHex] = await Promise.all([
    dependencies.generateKeyId(),
    dependencies.generateWrappingKeyHex(),
  ]);
  if (keyId === previousKeyId) throw new Error('Biometric re-enrollment produced a duplicate key reference.');
  const wrappedVaultKey = await dependencies.wrapVaultKeyForBiometric(
    vaultKeyHex,
    wrappingKeyHex,
    keyId,
  );

  let replacementStored = false;
  try {
    await dependencies.storeProtectedKey(keyId, wrappingKeyHex);
    replacementStored = true;
    const updated: VaultV3Envelope = {
      ...envelope,
      biometric: {
        keyId,
        scheme: 'aes-256-gcm+secure-store-v1',
        wrappedVaultKey,
      },
    };
    await dependencies.writeEnvelope(updated);
    try {
      await dependencies.deleteProtectedKey(previousKeyId);
    } catch {
      // The old key is no longer referenced and cannot unlock the new slot.
    }
    return updated;
  } catch (error) {
    if (replacementStored) {
      try {
        await dependencies.deleteProtectedKey(keyId);
      } catch {
        // The old envelope remains authoritative; the new key is unreachable.
      }
    }
    throw error;
  }
}
