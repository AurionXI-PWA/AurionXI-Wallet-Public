import {
  createVaultV3WithDependencies,
  type CreateVaultV3Input,
  unlockVaultV3WithPin,
} from './vault-envelope-v3-core';
import { nativeVaultV3Dependencies } from './vault-v3-workflow';
import { readMainnetVaultV3, writeMainnetVaultV3 } from './vault-store';

/**
 * Dedicated Mainnet storage workflow. It never reads Testnet storage and is
 * intentionally not connected to an onboarding screen in the preview build.
 */
export async function createAndStoreMainnetVault(input: CreateVaultV3Input) {
  const existing = await readMainnetVaultV3();
  if (existing) throw new Error('A Mainnet vault already exists in this namespace.');
  const envelope = await createVaultV3WithDependencies(input, nativeVaultV3Dependencies);
  await writeMainnetVaultV3(envelope);
  return envelope;
}

export async function unlockStoredMainnetVault(pin: string) {
  const envelope = await readMainnetVaultV3();
  if (!envelope) return null;
  return unlockVaultV3WithPin(envelope, pin, nativeVaultV3Dependencies);
}
