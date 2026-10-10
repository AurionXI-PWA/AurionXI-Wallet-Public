import { WALLET_SECRET_FEATURE } from '@/config/network';

import { deriveActiveTestnetRecoveryAddress } from './recovery-address-derivation';
import { destroyActiveRecoverySecretSession } from './recovery-secret-session-manager';
import { withActiveRecoveryVaultPayloadAsync } from './recovery-vault-payload-session';
import { createVaultV3Atomically } from './vault-v3-atomic-create-core';
import { createVaultV3WithDependencies, unlockVaultV3WithPin } from './vault-envelope-v3-core';
import { nativeVaultV3Dependencies } from './vault-v3-workflow';
import { enrollVaultIdentityAtomically } from './vault-identity-enrollment-core';
import { deleteVaultV3, getVaultStatus, readVaultV3, writeVaultV3 } from './vault-store';
import {
  deleteWalletIdentityRecord,
  readWalletIdentityRecord,
  writeWalletIdentityRecord,
} from './wallet-identity-record-store';

export async function createActiveTestnetRecoveryVault(
  pin: string,
  pinConfirmation: string,
) {
  if (!WALLET_SECRET_FEATURE.enabled) {
    throw new Error('Wallet-secret handling is disabled for this build.');
  }
  try {
    const publicAddress = deriveActiveTestnetRecoveryAddress();
    return await withActiveRecoveryVaultPayloadAsync((payload) => enrollVaultIdentityAtomically({
      createdAt: new Date().toISOString(),
      payload,
      pin,
      pinConfirmation,
      publicAddress,
    }, {
      createVault: (input) => createVaultV3Atomically(input, {
        build: (candidate) => createVaultV3WithDependencies(candidate, nativeVaultV3Dependencies),
        deleteStored: deleteVaultV3,
        getStatus: getVaultStatus,
        read: readVaultV3,
        unlock: (envelope, verifiedPin) => unlockVaultV3WithPin(
          envelope,
          verifiedPin,
          nativeVaultV3Dependencies,
        ),
        write: writeVaultV3,
      }),
      deleteIdentity: deleteWalletIdentityRecord,
      deleteVault: deleteVaultV3,
      getVaultStatus,
      readIdentity: readWalletIdentityRecord,
      readVault: readVaultV3,
      writeIdentity: writeWalletIdentityRecord,
    }));
  } finally {
    destroyActiveRecoverySecretSession();
  }
}
