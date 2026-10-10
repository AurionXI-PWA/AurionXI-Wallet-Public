import { generateRecoveryPhraseWithDependencies, type RecoveryPhraseGenerationDependencies } from './recovery-phrase-generation-core';

export type SyntheticRecoveryBackupGenerationProof = {
  generated: true;
  wordCount: number;
};

/**
 * Test-only, non-revealing generation boundary. The phrase exists only inside
 * this function long enough to establish its word count; it is never returned,
 * persisted, copied, logged, or passed to UI code.
 */
export async function generateSyntheticRecoveryBackupProof(
  dependencies: RecoveryPhraseGenerationDependencies,
): Promise<SyntheticRecoveryBackupGenerationProof> {
  const phrase = await generateRecoveryPhraseWithDependencies(dependencies);
  return {
    generated: true,
    wordCount: phrase.split(' ').length,
  };
}
