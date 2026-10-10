import AurionXiArgon2 from '../../modules/aurionxi-argon2/src/AurionXiArgon2Module';

import {
  createVaultV3WithDependencies,
  type CreateVaultV3Input,
  type VaultV3Dependencies,
  unlockVaultV3WithPin,
} from './vault-envelope-v3-core';
import { generateArgon2SaltHex, generateVaultKeyHex } from './secure-random';
import { readActiveVaultV3OrNull } from './vault-active-resolver';
import {
  decryptVaultV3Payload,
  encryptVaultV3Payload,
  unwrapVaultKeyForPin,
  wrapVaultKeyForPin,
} from './vault-v3-crypto';
import { writeVaultV3 } from './vault-store';

export const nativeVaultV3Dependencies: VaultV3Dependencies = {
  decryptPayload: decryptVaultV3Payload,
  derivePinWrappingKey: (pin, saltHex) => AurionXiArgon2.derivePinKeyAsync(pin, saltHex),
  encryptPayload: encryptVaultV3Payload,
  generateSaltHex: generateArgon2SaltHex,
  generateVaultKeyHex,
  unwrapVaultKey: unwrapVaultKeyForPin,
  wrapVaultKey: wrapVaultKeyForPin,
};

export async function createAndStoreVaultV3(input: CreateVaultV3Input) {
  const envelope = await createVaultV3WithDependencies(input, nativeVaultV3Dependencies);
  await writeVaultV3(envelope);
  return envelope;
}

export async function unlockStoredVaultV3(pin: string) {
  const resolution = await readActiveVaultV3OrNull();
  if (!resolution) return null;
  return unlockVaultV3WithPin(resolution.vault, pin, nativeVaultV3Dependencies);
}
