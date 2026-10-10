import { WALLET_SECRET_FEATURE } from '@/config/network';

import { deriveTestnetRecoveryAddressFromPhrase } from './recovery-address-derivation';
import { authenticateRecoveryOwnership } from './recovery-ownership-authenticator-core';
import { validateRecoveryPhrase } from './recovery-phrase-validation';
import type { VaultReplacementResumeScope } from './vault-replacement-resume-controller-core';
import { readWalletIdentityRecord } from './wallet-identity-record-store';

export function authenticateStoredRecoveryOwnership(
  recoveryPhrase: string,
  scope: VaultReplacementResumeScope,
): Promise<void> {
  return authenticateRecoveryOwnership(recoveryPhrase, scope, {
    deriveAddress: deriveTestnetRecoveryAddressFromPhrase,
    readIdentity: readWalletIdentityRecord,
    validatePhrase: (phrase) => validateRecoveryPhrase(phrase).ok,
    walletSecretFeatureEnabled: WALLET_SECRET_FEATURE.enabled,
  });
}
