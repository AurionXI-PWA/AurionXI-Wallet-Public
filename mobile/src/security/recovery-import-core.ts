import { recoveryPhraseToEntropy } from './recovery-phrase-validation';
import { zeroizeBytes } from './secret-memory';

export type RecoveryImportDependencies = {
  beginSession: (entropy: Uint8Array) => void;
  walletSecretFeatureEnabled: boolean;
};

export function beginImportedRecoverySession(
  phrase: string,
  dependencies: RecoveryImportDependencies,
): void {
  if (!dependencies.walletSecretFeatureEnabled) {
    throw new Error('Wallet-secret handling is disabled for this build.');
  }
  let entropy: Uint8Array | undefined;
  try {
    entropy = recoveryPhraseToEntropy(phrase);
    if (![16, 20, 24, 28, 32].includes(entropy.length)) {
      throw new Error('Recovery entropy length is invalid.');
    }
    dependencies.beginSession(entropy);
  } finally {
    zeroizeBytes(entropy);
  }
}
