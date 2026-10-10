import { entropyToMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';

import { decodeRecoveryVaultPayload } from './recovery-vault-payload';
import { zeroizeBytes } from './secret-memory';

/**
 * Converts an already-unlocked Mainnet vault payload into display-only recovery
 * words. The entropy copy is wiped before returning; callers must wipe payload.
 */
export function getRecoveryWordsFromPayload(payload: Uint8Array): readonly string[] {
  let entropy: Uint8Array | undefined;
  try {
    entropy = decodeRecoveryVaultPayload(payload).entropy;
    const words = entropyToMnemonic(entropy, wordlist).trim().split(/\s+/);
    if (words.length !== 24) throw new Error('Mainnet recovery phrase is invalid.');
    return words;
  } finally {
    zeroizeBytes(entropy);
  }
}

// Kept as a compatibility name for the already-reviewed Mainnet recovery
// screen. The payload format is network-neutral; each caller chooses its own
// separately namespaced vault before this display-only conversion.
export const getMainnetRecoveryWordsFromPayload = getRecoveryWordsFromPayload;
