import AurionXiArgon2 from '../../modules/aurionxi-argon2/src/AurionXiArgon2Module';

import {
  assertBiometricAuthenticationEpoch,
  authenticateStrongBiometric,
  type BiometricAuthenticationOutcome,
  getBiometricAuthenticationEpoch,
} from './biometric-authentication';
import { getBiometricCapability } from './biometric-capability';
import { auditStoredBiometricIntegrity } from './biometric-integrity';
import {
  deleteBiometricWrappingKey,
  readBiometricWrappingKey,
  storeBiometricWrappingKey,
} from './biometric-key-store';
import { generateArgon2SaltHex, generateVaultKeyHex } from './secure-random';
import { readActiveVaultV3 } from './vault-active-resolver';
import {
  disableBiometricSlotSafely,
  enableBiometricSlotAtomically,
  replaceBiometricSlotAtomically,
} from './vault-biometric-slot-core';
import {
  decryptVaultV3Payload,
  unwrapVaultKeyForBiometric,
  unwrapVaultKeyForPin,
  wrapVaultKeyForBiometric,
} from './vault-v3-crypto';
import { writeVaultV3, writeVaultV3Candidate } from './vault-store';
import { authenticateEncryptedVaultWithRetry } from './vault-workflow';

export type BiometricWorkflowFailure =
  | Exclude<BiometricAuthenticationOutcome, 'authenticated'>
  | 'enrollment-changed'
  | 'vault-not-primary';

export class BiometricWorkflowError extends Error {
  constructor(public readonly outcome: BiometricWorkflowFailure) {
    super(`Biometric authentication did not complete: ${outcome}.`);
    this.name = 'BiometricWorkflowError';
  }
}

async function requireStrongAuthentication() {
  const capability = await getBiometricCapability();
  if (!capability.canOfferOptIn) throw new BiometricWorkflowError('unavailable');
  const outcome = await authenticateStrongBiometric();
  if (outcome !== 'authenticated') throw new BiometricWorkflowError(outcome);
}

type ActiveVaultBiometricMutationTarget = {
  envelope: Awaited<ReturnType<typeof readActiveVaultV3>>['vault'];
  writeEnvelope: (updated: Awaited<ReturnType<typeof readActiveVaultV3>>['vault']) => Promise<void>;
};

function isSameVaultSnapshot(
  left: ActiveVaultBiometricMutationTarget['envelope'],
  right: ActiveVaultBiometricMutationTarget['envelope'],
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

async function requireActiveVaultForBiometricMutation(): Promise<ActiveVaultBiometricMutationTarget> {
  const resolution = await readActiveVaultV3();
  const expectedSlot = resolution.slot;
  const expectedEnvelope = resolution.vault;

  return {
    envelope: expectedEnvelope,
    writeEnvelope: async (updated) => {
      // Re-resolving immediately before persistence re-checks the active-slot
      // pointer and replacement journal. A state transition or replacement of
      // the active envelope makes this mutation fail closed.
      const fresh = await readActiveVaultV3();
      if (fresh.slot !== expectedSlot || !isSameVaultSnapshot(fresh.vault, expectedEnvelope)) {
        throw new Error('Active vault changed during biometric configuration.');
      }

      if (expectedSlot === 'candidate') {
        await writeVaultV3Candidate(updated);
        return;
      }
      await writeVaultV3(updated);
    },
  };
}

function requireCurrentBiometricSession(expectedEpoch: number) {
  try {
    assertBiometricAuthenticationEpoch(expectedEpoch);
  } catch {
    throw new BiometricWorkflowError('session-invalidated');
  }
}

export async function enableStoredVaultBiometrics(pin: string) {
  const epoch = getBiometricAuthenticationEpoch();
  const target = await requireActiveVaultForBiometricMutation();
  const { envelope } = target;
  // PIN authentication and persistent retry protection must complete before
  // any biometric prompt or protected-key mutation is allowed.
  await authenticateEncryptedVaultWithRetry(pin);
  await requireStrongAuthentication();
  requireCurrentBiometricSession(epoch);
  return enableBiometricSlotAtomically(envelope, pin, true, {
    deleteProtectedKey: deleteBiometricWrappingKey,
    generateKeyId: generateArgon2SaltHex,
    generateWrappingKeyHex: generateVaultKeyHex,
    storeProtectedKey: storeBiometricWrappingKey,
    unwrapVaultKeyWithPin: async (current, verifiedPin) => {
      const wrappingKey = await AurionXiArgon2.derivePinKeyAsync(verifiedPin, current.pin.saltHex);
      return unwrapVaultKeyForPin(current.pin.wrappedVaultKey, wrappingKey, current);
    },
    wrapVaultKeyForBiometric: (vaultKey, wrappingKey, keyId) => wrapVaultKeyForBiometric(
      vaultKey,
      wrappingKey,
      envelope,
      keyId,
    ),
    writeEnvelope: (updated) => {
      requireCurrentBiometricSession(epoch);
      return target.writeEnvelope(updated);
    },
  });
}

export async function unlockStoredVaultWithBiometrics(): Promise<Uint8Array> {
  const epoch = getBiometricAuthenticationEpoch();
  const { vault: envelope } = await readActiveVaultV3();
  if (!envelope?.biometric) throw new BiometricWorkflowError('unavailable');
  await requireStrongAuthentication();
  const wrappingKey = await readBiometricWrappingKey(envelope.biometric.keyId);
  if (!wrappingKey) throw new BiometricWorkflowError('enrollment-changed');
  const vaultKey = await unwrapVaultKeyForBiometric(
    envelope.biometric.wrappedVaultKey,
    wrappingKey,
    envelope,
    envelope.biometric.keyId,
  );
  const payload = await decryptVaultV3Payload(envelope.payloadCiphertext, vaultKey, envelope);
  requireCurrentBiometricSession(epoch);
  return payload;
}

export async function disableStoredVaultBiometrics(pin: string) {
  const epoch = getBiometricAuthenticationEpoch();
  const target = await requireActiveVaultForBiometricMutation();
  const { envelope } = target;
  if (!envelope?.biometric) throw new Error('Biometric unlock is not configured.');
  await authenticateEncryptedVaultWithRetry(pin);
  requireCurrentBiometricSession(epoch);
  return disableBiometricSlotSafely(envelope, true, {
    deleteProtectedKey: deleteBiometricWrappingKey,
    writeEnvelope: (updated) => {
      requireCurrentBiometricSession(epoch);
      return target.writeEnvelope(updated);
    },
  });
}

export async function reenrollStoredVaultBiometrics(pin: string) {
  const epoch = getBiometricAuthenticationEpoch();
  const target = await requireActiveVaultForBiometricMutation();
  const { envelope } = target;
  if (!envelope?.biometric) throw new Error('Biometric unlock is not configured.');
  await authenticateEncryptedVaultWithRetry(pin);
  await requireStrongAuthentication();
  requireCurrentBiometricSession(epoch);
  return replaceBiometricSlotAtomically(envelope, pin, true, {
    deleteProtectedKey: deleteBiometricWrappingKey,
    generateKeyId: generateArgon2SaltHex,
    generateWrappingKeyHex: generateVaultKeyHex,
    storeProtectedKey: storeBiometricWrappingKey,
    unwrapVaultKeyWithPin: async (current, verifiedPin) => {
      const wrappingKey = await AurionXiArgon2.derivePinKeyAsync(verifiedPin, current.pin.saltHex);
      return unwrapVaultKeyForPin(current.pin.wrappedVaultKey, wrappingKey, current);
    },
    wrapVaultKeyForBiometric: (vaultKey, wrappingKey, keyId) => wrapVaultKeyForBiometric(
      vaultKey,
      wrappingKey,
      envelope,
      keyId,
    ),
    writeEnvelope: (updated) => {
      requireCurrentBiometricSession(epoch);
      return target.writeEnvelope(updated);
    },
  });
}

export async function cleanupStoredOrphanedBiometricKeys(pin: string): Promise<number> {
  // The PIN gate must complete before any permanent protected-key deletion.
  await authenticateEncryptedVaultWithRetry(pin);
  // Audit only after PIN verification so cleanup acts on a fresh snapshot and
  // can never delete the currently referenced biometric wrapping key.
  const audit = await auditStoredBiometricIntegrity();
  for (const keyId of audit.orphanedKeyIds) {
    await deleteBiometricWrappingKey(keyId);
  }
  return audit.orphanedKeyIds.length;
}
