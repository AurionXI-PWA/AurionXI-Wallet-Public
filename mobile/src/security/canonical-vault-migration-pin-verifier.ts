import { createAbortAwarePinVerifier } from './abort-aware-pin-verifier-adapter-core';
import { authenticateEncryptedVaultWithRetry } from './vault-workflow';

export const authenticateCanonicalVaultMigrationPin = createAbortAwarePinVerifier(
  (pin) => authenticateEncryptedVaultWithRetry(pin),
);
