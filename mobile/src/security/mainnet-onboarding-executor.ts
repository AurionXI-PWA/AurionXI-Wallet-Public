import {
  createVaultV3WithDependencies,
  type CreateVaultV3Input,
  unlockVaultV3WithPin,
} from './vault-envelope-v3-core';
import { createVaultV3Atomically } from './vault-v3-atomic-create-core';
import { enrollVaultIdentityAtomically } from './vault-identity-enrollment-core';
import { nativeVaultV3Dependencies } from './vault-v3-workflow';
import {
  deleteMainnetVaultV3,
  getMainnetVaultV3Status,
  readMainnetVaultV3,
  writeMainnetVaultV3,
} from './vault-store';
import {
  deleteMainnetWalletIdentityRecord,
  readMainnetWalletIdentityRecord,
  writeMainnetWalletIdentityRecord,
} from './wallet-identity-record-store';

/**
 * Completes a separately authorised Mainnet onboarding flow by atomically
 * creating and read-back verifying only the Mainnet vault and its public
 * identity record. It is intentionally not wired to a route in this preview.
 *
 * The caller must have already completed the Mainnet-only onboarding gates.
 * This executor neither generates/imports recovery material nor signs,
 * broadcasts, or communicates with a network.
 */
export async function executeMainnetOnboardingWithIdentity(
  input: CreateVaultV3Input,
) {
  return enrollVaultIdentityAtomically(input, {
    createVault: (candidate) => createVaultV3Atomically(candidate, {
      build: (value) => createVaultV3WithDependencies(value, nativeVaultV3Dependencies),
      deleteStored: deleteMainnetVaultV3,
      getStatus: getMainnetVaultV3Status,
      read: readMainnetVaultV3,
      unlock: (envelope, verifiedPin) => unlockVaultV3WithPin(
        envelope,
        verifiedPin,
        nativeVaultV3Dependencies,
      ),
      write: writeMainnetVaultV3,
    }),
    deleteIdentity: deleteMainnetWalletIdentityRecord,
    deleteVault: deleteMainnetVaultV3,
    getVaultStatus: getMainnetVaultV3Status,
    readIdentity: readMainnetWalletIdentityRecord,
    readVault: readMainnetVaultV3,
    writeIdentity: writeMainnetWalletIdentityRecord,
  });
}
