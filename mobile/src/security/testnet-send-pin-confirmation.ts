import { authenticateEncryptedVaultWithRetry } from './vault-workflow';
import {
  confirmTestnetSendPinWithDependencies,
  type TestnetSendPinConfirmationResult,
} from './testnet-send-pin-confirmation-core';

/**
 * Native adapter for a fresh transaction PIN check. `authenticateEncryptedVaultWithRetry`
 * authenticates then zeroizes decrypted vault material before this function receives
 * control, so the result is only a short-lived timestamp.
 */
export function confirmTestnetSendPin(input: {
  vaultUnlocked: boolean;
  pin: string;
  now?: number;
}): Promise<TestnetSendPinConfirmationResult> {
  return confirmTestnetSendPinWithDependencies({
    vaultUnlocked: input.vaultUnlocked,
    now: input.now ?? Date.now(),
    authenticatePin: () => authenticateEncryptedVaultWithRetry(input.pin),
  });
}
