import { readVaultActiveSlot, writeVaultActiveSlot } from './vault-active-slot-store';
import { readVaultReplacementJournal, writeVaultReplacementJournal } from './vault-replacement-journal-store';
import { executeNextVaultReplacementPromotionStep } from './vault-replacement-promotion-executor-core';
import type { VaultReplacementResumeState } from './vault-replacement-resume-policy';
import { getVaultStatus, readVaultV3Candidate } from './vault-store';

let promotionStepActive = false;

export async function executeAuthorizedVaultReplacementPromotionStep(
  authorization: VaultReplacementResumeState,
  now = Date.now(),
) {
  if (promotionStepActive) throw new Error('A vault replacement promotion step is already active.');
  promotionStepActive = true;
  try {
    return await executeNextVaultReplacementPromotionStep(authorization, {
      getPrimaryStatus: getVaultStatus,
      readActiveSlot: readVaultActiveSlot,
      readCandidate: readVaultV3Candidate,
      readJournal: readVaultReplacementJournal,
      writeActiveSlot: writeVaultActiveSlot,
      writeJournal: writeVaultReplacementJournal,
    }, now);
  } finally {
    promotionStepActive = false;
  }
}
