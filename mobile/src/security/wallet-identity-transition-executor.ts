import type { WalletIdentityTransitionAuthorization } from './wallet-identity-transition-authorization';
import { executeNextWalletIdentityTransitionStep } from './wallet-identity-transition-executor-core';
import {
  writeWalletIdentityTransitionJournalVerified,
} from './wallet-identity-transition-journal-store';
import { readStoredWalletIdentityTransitionSnapshot } from './wallet-identity-transition-snapshot';
import {
  readWalletIdentityRecord,
  writeWalletIdentityRecord,
} from './wallet-identity-record-store';

let transitionStepActive = false;

export async function executeAuthorizedWalletIdentityTransitionStep(
  authorization: WalletIdentityTransitionAuthorization,
  now = Date.now(),
) {
  if (transitionStepActive) throw new Error('A wallet identity transition step is already active.');
  transitionStepActive = true;
  try {
    return await executeNextWalletIdentityTransitionStep(authorization, {
      readIdentity: readWalletIdentityRecord,
      readSnapshot: readStoredWalletIdentityTransitionSnapshot,
      writeIdentity: writeWalletIdentityRecord,
      writeJournalVerified: writeWalletIdentityTransitionJournalVerified,
    }, now);
  } finally {
    transitionStepActive = false;
  }
}
