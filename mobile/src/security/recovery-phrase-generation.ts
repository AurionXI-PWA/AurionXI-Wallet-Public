import { getRandomBytesAsync } from 'expo-crypto';

import { WALLET_SECRET_FEATURE } from '@/config/network';

import { beginRecoverySecretSession } from './recovery-secret-session-manager';
import { RecoverySessionStartGate } from './recovery-session-start-core';

const startGate = new RecoverySessionStartGate();

export function beginTestnetRecoverySecretSession(): Promise<void> {
  return startGate.run({
    beginSession: beginRecoverySecretSession,
    randomBytes: getRandomBytesAsync,
    walletSecretFeatureEnabled: WALLET_SECRET_FEATURE.enabled,
  });
}
