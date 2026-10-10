import { INITIAL_WALLET_IDENTITY_TRANSITION_AUTHORIZATION } from './wallet-identity-transition-authorization';
import { executeAuthorizedWalletIdentityTransitionStep } from './wallet-identity-transition-executor';
import { readWalletIdentityTransitionJournal } from './wallet-identity-transition-journal-store';
import { coordinateStartupWalletIdentityTransitionRecovery } from './wallet-identity-transition-recovery-core';

let startupIdentityTransitionRecoveryActive = false;

export async function recoverOneStartupWalletIdentityTransitionStep() {
  if (startupIdentityTransitionRecoveryActive) {
    throw new Error('Startup wallet identity transition recovery is already active.');
  }
  startupIdentityTransitionRecoveryActive = true;
  try {
    return await coordinateStartupWalletIdentityTransitionRecovery({
      executeDurableTransitionStep: async () => {
        await executeAuthorizedWalletIdentityTransitionStep(
          INITIAL_WALLET_IDENTITY_TRANSITION_AUTHORIZATION,
        );
      },
      readTransitionJournal: readWalletIdentityTransitionJournal,
    });
  } finally {
    startupIdentityTransitionRecoveryActive = false;
  }
}
