import { readVaultActiveSlot } from './vault-active-slot-store';
import { readVaultReplacementJournal } from './vault-replacement-journal-store';
import { readRetiredPrimaryCleanupJournal } from './retired-primary-cleanup-journal-store';
import { executeAuthorizedVaultReplacementPromotionStep } from './vault-replacement-promotion-executor';
import { coordinateStartupVaultReplacementPromotionRecovery } from './vault-replacement-promotion-recovery-core';
import { INITIAL_VAULT_REPLACEMENT_RESUME_STATE } from './vault-replacement-resume-policy';
import { getVaultStatus, readVaultV3Candidate } from './vault-store';

let startupPromotionRecoveryActive = false;

export async function recoverOneStartupVaultReplacementPromotionStep() {
  if (startupPromotionRecoveryActive) {
    throw new Error('Startup vault replacement promotion recovery is already active.');
  }
  startupPromotionRecoveryActive = true;
  try {
    return await coordinateStartupVaultReplacementPromotionRecovery({
      executeDurablePromotionStep: async () => {
        await executeAuthorizedVaultReplacementPromotionStep(
          INITIAL_VAULT_REPLACEMENT_RESUME_STATE,
        );
      },
      readSnapshot: async () => {
        const [activeSlot, candidate, cleanupJournal, journal, primaryStatus] = await Promise.all([
          readVaultActiveSlot(),
          readVaultV3Candidate(),
          readRetiredPrimaryCleanupJournal(),
          readVaultReplacementJournal(),
          getVaultStatus(),
        ]);
        return { activeSlot, candidate, cleanupJournal, journal, primaryStatus };
      },
    });
  } finally {
    startupPromotionRecoveryActive = false;
  }
}
