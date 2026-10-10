import AurionXiArgon2 from '../../modules/aurionxi-argon2/src/AurionXiArgon2Module';

import {
  decryptVaultPayload,
  encryptVaultPayload,
  VaultCryptographyError,
} from './vault-crypto';
import {
  clearPinRetryState,
  getPinRetryGate,
  registerPinFailure,
} from './pin-retry-store';
import { generateArgon2SaltHex } from './secure-random';
import { readActiveVaultV3OrNull } from './vault-active-resolver';
import {
  deleteEncryptedVault,
  deleteVaultV3,
  readEncryptedVault,
  readTestnetVaultV3,
  readVaultV3,
  writeEncryptedVault,
  writeVaultV3,
} from './vault-store';
import {
  type CreateVaultInput,
  type VaultWorkflowDependencies,
} from './vault-workflow-core';
import { unlockWithPinRetry } from './vault-unlock-gate';
import { createVaultV3WithDependencies, unlockVaultV3WithPin } from './vault-envelope-v3-core';
import { migrateV2ToV3Atomically } from './vault-v3-migration-core';
import { nativeVaultV3Dependencies } from './vault-v3-workflow';
import { withZeroizedBytes } from './secret-memory';

const nativeDependencies: VaultWorkflowDependencies = {
  decrypt: decryptVaultPayload,
  derivePinKey: (pin, saltHex) => AurionXiArgon2.derivePinKeyAsync(pin, saltHex),
  encrypt: encryptVaultPayload,
  generateSaltHex: generateArgon2SaltHex,
  read: readEncryptedVault,
  write: writeEncryptedVault,
};

export async function createEncryptedVault(input: CreateVaultInput) {
  const envelope = await createVaultV3WithDependencies(input, nativeVaultV3Dependencies);
  await writeVaultV3(envelope);
  return envelope;
}

export async function unlockEncryptedVault(pin: string) {
  const active = await readActiveVaultV3OrNull();
  if (active) return unlockVaultV3WithPin(active.vault, pin, nativeVaultV3Dependencies);

  const migrated = await migrateV2ToV3Atomically(pin, {
    buildV3: (legacy, plaintext, verifiedPin) => createVaultV3WithDependencies({
      createdAt: legacy.createdAt,
      payload: plaintext,
      pin: verifiedPin,
      pinConfirmation: verifiedPin,
      publicAddress: legacy.publicAddress,
    }, nativeVaultV3Dependencies),
    deleteLegacy: deleteEncryptedVault,
    deleteV3: deleteVaultV3,
    decryptLegacy: async (legacy, verifiedPin) => {
      const derivedKeyHex = await nativeDependencies.derivePinKey(verifiedPin, legacy.kdf.saltHex);
      return nativeDependencies.decrypt(legacy, derivedKeyHex);
    },
    readLegacy: readEncryptedVault,
    readV3: readVaultV3,
    unlockV3: (envelope, verifiedPin) => unlockVaultV3WithPin(
      envelope,
      verifiedPin,
      nativeVaultV3Dependencies,
    ),
    writeV3: writeVaultV3,
  });
  return unlockVaultV3WithPin(migrated, pin, nativeVaultV3Dependencies);
}

export function unlockEncryptedVaultWithRetry(pin: string) {
  return unlockWithPinRetry(pin, {
    authenticate: unlockEncryptedVault,
    clearRetryState: clearPinRetryState,
    getRetryGate: (now) => getPinRetryGate(now),
    isAuthenticationFailure: (error) => error instanceof VaultCryptographyError,
    registerFailure: (now) => registerPinFailure(now),
  });
}

export function authenticateEncryptedVaultWithRetry(pin: string): Promise<void> {
  return withZeroizedBytes(
    () => unlockEncryptedVaultWithRetry(pin),
    () => undefined,
  );
}

/**
 * Opens only the separately namespaced Testnet vault. It deliberately does
 * not fall back to a Mainnet record or to the legacy active-vault resolver.
 */
export function unlockStoredTestnetVaultWithRetry(pin: string): Promise<Uint8Array> {
  return unlockWithPinRetry(pin, {
    authenticate: async (verifiedPin) => {
      const envelope = await readTestnetVaultV3();
      if (!envelope) throw new VaultCryptographyError();
      return unlockVaultV3WithPin(envelope, verifiedPin, nativeVaultV3Dependencies);
    },
    clearRetryState: clearPinRetryState,
    getRetryGate: (now) => getPinRetryGate(now),
    isAuthenticationFailure: (error) => error instanceof VaultCryptographyError,
    registerFailure: (now) => registerPinFailure(now),
  });
}
