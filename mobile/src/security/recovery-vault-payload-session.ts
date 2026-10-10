import {
  withActiveRecoveryEntropy,
  withActiveRecoveryEntropyAsync,
} from './recovery-secret-session-manager';
import {
  withEncodedRecoveryVaultPayload,
  withEncodedRecoveryVaultPayloadAsync,
} from './recovery-vault-payload';

export function withActiveRecoveryVaultPayload<T>(
  consumer: (payload: Uint8Array) => T,
): T {
  return withActiveRecoveryEntropy((entropy) => (
    withEncodedRecoveryVaultPayload(entropy, consumer)
  ));
}

export function withActiveRecoveryVaultPayloadAsync<T>(
  consumer: (payload: Uint8Array) => Promise<T>,
): Promise<T> {
  return withActiveRecoveryEntropyAsync((entropy) => (
    withEncodedRecoveryVaultPayloadAsync(entropy, consumer)
  ));
}
