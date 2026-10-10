import { entropyToMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';

import { zeroizeBytes } from './secret-memory';
import { WALLET_KEY_POLICY } from './wallet-key-policy';

export type RecoveryPhraseGenerationDependencies = {
  randomBytes: (length: number) => Promise<Uint8Array>;
  walletSecretFeatureEnabled: boolean;
};

const ENTROPY_BYTES = WALLET_KEY_POLICY.bip39EntropyBits / 8;

export async function generateRecoveryPhraseWithDependencies(
  dependencies: RecoveryPhraseGenerationDependencies,
): Promise<string> {
  if (!dependencies.walletSecretFeatureEnabled) {
    throw new Error('Wallet-secret handling is disabled for this build.');
  }

  let entropy: Uint8Array | undefined;
  try {
    entropy = await dependencies.randomBytes(ENTROPY_BYTES);
    if (entropy.length !== ENTROPY_BYTES) {
      throw new Error('Secure random source returned an invalid entropy length.');
    }
    const mnemonic = entropyToMnemonic(entropy, wordlist);
    if (mnemonic.split(' ').length !== WALLET_KEY_POLICY.bip39GeneratedWordCount) {
      throw new Error('Recovery phrase generation failed closed.');
    }
    return mnemonic;
  } finally {
    zeroizeBytes(entropy);
  }
}
