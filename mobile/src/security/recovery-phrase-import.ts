import { WALLET_SECRET_FEATURE } from '@/config/network';

import { beginImportedRecoverySession } from './recovery-import-core';
import { beginRecoverySecretSession } from './recovery-secret-session-manager';

/**
 * Starts a device-local imported recovery session only after BIP-39 validation.
 * The caller must clear its text input immediately after this returns.
 */
export function beginImportedTestnetRecoverySession(phrase: string): void {
  beginImportedRecoverySession(phrase, {
    beginSession: beginRecoverySecretSession,
    walletSecretFeatureEnabled: WALLET_SECRET_FEATURE.enabled,
  });
}
