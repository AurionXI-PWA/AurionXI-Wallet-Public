import { WALLET_SECRET_FEATURE } from '@/config/network';

import { beginImportedRecoverySession } from './recovery-import-core';
import { beginRecoverySecretSession } from './recovery-secret-session-manager';

export function beginImportedTestnetRecoverySecretSession(phrase: string): void {
  beginImportedRecoverySession(phrase, {
    beginSession: beginRecoverySecretSession,
    walletSecretFeatureEnabled: WALLET_SECRET_FEATURE.enabled,
  });
}
