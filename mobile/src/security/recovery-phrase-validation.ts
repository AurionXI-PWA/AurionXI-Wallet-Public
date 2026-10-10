import { mnemonicToEntropy, validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';

import { isSupportedBip39ImportWordCount } from './wallet-key-policy';

const MAX_RECOVERY_INPUT_LENGTH = 512;

export type RecoveryPhraseValidation =
  | { ok: true; wordCount: number }
  | {
    ok: false;
    reason: 'input-too-long' | 'unsupported-word-count' | 'invalid-word-or-checksum';
  };

function normalizeRecoveryPhrase(input: string): string {
  return input.normalize('NFKD').trim().toLocaleLowerCase('en-US').split(/\s+/u).join(' ');
}

export function validateRecoveryPhrase(input: string): RecoveryPhraseValidation {
  if (input.length > MAX_RECOVERY_INPUT_LENGTH) return { ok: false, reason: 'input-too-long' };
  const normalized = normalizeRecoveryPhrase(input);
  const wordCount = normalized.length === 0 ? 0 : normalized.split(' ').length;
  if (!isSupportedBip39ImportWordCount(wordCount)) {
    return { ok: false, reason: 'unsupported-word-count' };
  }
  if (!validateMnemonic(normalized, wordlist)) {
    return { ok: false, reason: 'invalid-word-or-checksum' };
  }
  return { ok: true, wordCount };
}

export function recoveryPhraseToEntropy(input: string): Uint8Array {
  const validation = validateRecoveryPhrase(input);
  if (!validation.ok) throw new Error('Recovery phrase validation failed.');
  return mnemonicToEntropy(normalizeRecoveryPhrase(input), wordlist);
}
