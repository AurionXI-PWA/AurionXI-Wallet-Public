import { INITIAL_RETIRED_PRIMARY_CLEANUP_AUTHORIZATION } from './retired-primary-cleanup-authorization';
import { executeAuthorizedRetiredPrimaryCleanupStep } from './retired-primary-cleanup-executor';
import { readRetiredPrimaryCleanupJournal } from './retired-primary-cleanup-journal-store';
import { coordinateRetiredPrimaryCleanupRecovery } from './retired-primary-cleanup-recovery-core';

let startupCleanupRecoveryActive = false;

export async function recoverOneStartupRetiredPrimaryCleanupStep() {
  if (startupCleanupRecoveryActive) {
    throw new Error('Startup retired primary cleanup recovery is already active.');
  }
  startupCleanupRecoveryActive = true;
  try {
    return await coordinateRetiredPrimaryCleanupRecovery({
      executeDurableCleanupStep: async () => {
        await executeAuthorizedRetiredPrimaryCleanupStep(
          INITIAL_RETIRED_PRIMARY_CLEANUP_AUTHORIZATION,
        );
      },
      readCleanupJournal: readRetiredPrimaryCleanupJournal,
    });
  } finally {
    startupCleanupRecoveryActive = false;
  }
}
