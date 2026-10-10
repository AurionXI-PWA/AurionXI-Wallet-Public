import { validateRecoveryPhrase, type RecoveryPhraseValidation } from './recovery-phrase-validation';

export type SyntheticRecoveryImportPreflight =
  | { eligible: true; wordCount: number }
  | { eligible: false; reason: Exclude<RecoveryPhraseValidation, { ok: true }>['reason'] };

/**
 * Non-mutating import boundary. It validates in-memory text and intentionally
 * returns no phrase material, derived key, address, vault, or write authority.
 */
export function preflightSyntheticRecoveryImport(input: string): SyntheticRecoveryImportPreflight {
  const validation = validateRecoveryPhrase(input);
  if (!validation.ok) return { eligible: false, reason: validation.reason };
  return { eligible: true, wordCount: validation.wordCount };
}
