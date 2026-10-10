import type { RetiredPrimaryCleanupAuthorization } from './retired-primary-cleanup-authorization';
import {
  executeNextRetiredPrimaryCleanupStep,
  recordAuthorizedRetiredPrimaryCleanupIntent,
} from './retired-primary-cleanup-executor-core';
import { writeRetiredPrimaryCleanupJournalVerified } from './retired-primary-cleanup-journal-store';
import { readStoredRetiredPrimaryCleanupSnapshot } from './retired-primary-cleanup-snapshot';
import { deleteVaultV3 } from './vault-store';

let cleanupStepActive = false;

export async function recordAuthorizedRetiredPrimaryCleanupIntentOnly(
  authorization: RetiredPrimaryCleanupAuthorization,
  now = Date.now(),
) {
  if (cleanupStepActive) throw new Error('A retired primary cleanup step is already active.');
  cleanupStepActive = true;
  try {
    return await recordAuthorizedRetiredPrimaryCleanupIntent(authorization, {
      readSnapshot: readStoredRetiredPrimaryCleanupSnapshot,
      writeJournalVerified: writeRetiredPrimaryCleanupJournalVerified,
    }, now);
  } finally {
    cleanupStepActive = false;
  }
}

export async function executeAuthorizedRetiredPrimaryCleanupStep(
  authorization: RetiredPrimaryCleanupAuthorization,
  now = Date.now(),
) {
  if (cleanupStepActive) throw new Error('A retired primary cleanup step is already active.');
  cleanupStepActive = true;
  try {
    return await executeNextRetiredPrimaryCleanupStep(authorization, {
      deleteRetiredPrimary: deleteVaultV3,
      readSnapshot: readStoredRetiredPrimaryCleanupSnapshot,
      writeJournalVerified: writeRetiredPrimaryCleanupJournalVerified,
    }, now);
  } finally {
    cleanupStepActive = false;
  }
}
