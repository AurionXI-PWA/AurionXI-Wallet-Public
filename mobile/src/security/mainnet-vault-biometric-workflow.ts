import AurionXiArgon2 from '../../modules/aurionxi-argon2/src/AurionXiArgon2Module';

import { authenticateStrongBiometric, type BiometricAuthenticationOutcome } from './biometric-authentication';
import { getBiometricCapability } from './biometric-capability';
import { deleteMainnetBiometricWrappingKey, readMainnetBiometricWrappingKey, storeMainnetBiometricWrappingKey } from './mainnet-biometric-key-store';
import { clearMainnetPinRetryState, getMainnetPinRetryGate, registerMainnetPinFailure } from './mainnet-pin-retry-store';
import { generateArgon2SaltHex, generateVaultKeyHex } from './secure-random';
import { enableBiometricSlotAtomically } from './vault-biometric-slot-core';
import { readMainnetVaultV3, writeMainnetVaultV3 } from './vault-store';
import { unlockStoredMainnetVault } from './mainnet-vault-workflow';
import { decryptVaultV3Payload, unwrapVaultKeyForBiometric, unwrapVaultKeyForPin, wrapVaultKeyForBiometric } from './vault-v3-crypto';
import { InvalidVaultPinError, unlockWithPinRetry } from './vault-unlock-gate';
import { VaultCryptographyError } from './vault-crypto';
import { withZeroizedBytes } from './secret-memory';
import { requireMainnetUnlockHostReady } from './mainnet-unlock-host';

export class MainnetBiometricWorkflowError extends Error {
  constructor(public readonly outcome: Exclude<BiometricAuthenticationOutcome, 'authenticated'> | 'unavailable' | 'enrollment-changed') {
    super(`Mainnet biometric authentication did not complete: ${outcome}.`);
  }
}

async function verifyMainnetPin(pin: string): Promise<Uint8Array> {
  return unlockWithPinRetry(pin, {
    authenticate: async (value) => {
      const payload = await unlockStoredMainnetVault(value);
      if (!payload) throw new InvalidVaultPinError();
      return payload;
    },
    clearRetryState: clearMainnetPinRetryState,
    getRetryGate: getMainnetPinRetryGate,
    isAuthenticationFailure: (error) => error instanceof VaultCryptographyError || error instanceof InvalidVaultPinError,
    registerFailure: registerMainnetPinFailure,
  });
}

/** PIN unlock decrypts only a Mainnet envelope and never signs or broadcasts. */
export function unlockMainnetVaultWithPin(pin: string): Promise<Uint8Array> {
  return verifyMainnetPin(pin);
}

async function requireStrongMainnetBiometric(isCurrent?: () => boolean): Promise<void> {
  const capability = await getBiometricCapability();
  if (!capability.canOfferOptIn) throw new MainnetBiometricWorkflowError('unavailable');
  if (isCurrent) await requireMainnetUnlockHostReady(isCurrent);
  const outcome = await authenticateStrongBiometric();
  if (outcome !== 'authenticated') throw new MainnetBiometricWorkflowError(outcome);
}

/** PIN-first opt-in for the dedicated Mainnet vault only. */
export async function enableMainnetVaultBiometrics(pin: string) {
  const envelope = await readMainnetVaultV3();
  if (!envelope) throw new MainnetBiometricWorkflowError('unavailable');
  await withZeroizedBytes(() => verifyMainnetPin(pin), () => undefined);
  await requireStrongMainnetBiometric();
  return enableBiometricSlotAtomically(envelope, pin, true, {
    deleteProtectedKey: deleteMainnetBiometricWrappingKey,
    generateKeyId: generateArgon2SaltHex,
    generateWrappingKeyHex: generateVaultKeyHex,
    storeProtectedKey: storeMainnetBiometricWrappingKey,
    unwrapVaultKeyWithPin: async (current, verifiedPin) => unwrapVaultKeyForPin(current.pin.wrappedVaultKey, await AurionXiArgon2.derivePinKeyAsync(verifiedPin, current.pin.saltHex), current),
    wrapVaultKeyForBiometric: (vaultKey, wrappingKey, keyId) => wrapVaultKeyForBiometric(vaultKey, wrappingKey, envelope, keyId),
    writeEnvelope: writeMainnetVaultV3,
  });
}

/** Biometric unlock decrypts only a Mainnet envelope and never signs or broadcasts. */
let mainnetBiometricUnlockInFlight = false;
export async function unlockMainnetVaultWithBiometrics(isCurrent: () => boolean = () => true): Promise<Uint8Array> {
  if (mainnetBiometricUnlockInFlight) throw new MainnetBiometricWorkflowError('busy');
  mainnetBiometricUnlockInFlight = true;
  try {
    const envelope = await readMainnetVaultV3();
    if (!envelope?.biometric) throw new MainnetBiometricWorkflowError('unavailable');
    await requireStrongMainnetBiometric(isCurrent);
    // SecureStore owns its second prompt. Do not pretend cancellation of Expo
    // LocalAuthentication released that worker; PIN remains a separate fallback.
    await requireMainnetUnlockHostReady(isCurrent);
    const wrappingKey = await readMainnetBiometricWrappingKey(envelope.biometric.keyId);
    if (!isCurrent()) throw new MainnetBiometricWorkflowError('session-invalidated');
    if (!wrappingKey) throw new MainnetBiometricWorkflowError('enrollment-changed');
    const vaultKey = await unwrapVaultKeyForBiometric(envelope.biometric.wrappedVaultKey, wrappingKey, envelope, envelope.biometric.keyId);
    return await decryptVaultV3Payload(envelope.payloadCiphertext, vaultKey, envelope);
  } finally {
    mainnetBiometricUnlockInFlight = false;
  }
}
