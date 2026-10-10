import { withEncodedRecoveryVaultPayloadAsync } from './recovery-vault-payload';
import { executeMainnetOnboardingWithIdentity } from './mainnet-onboarding-executor';
import { deriveActiveMainnetRecoveryAddress } from './mainnet-recovery-session';
import {
  destroyActiveMainnetRecoverySecretSession,
  withActiveMainnetRecoveryEntropyAsync,
} from './mainnet-recovery-secret-session-manager';

/** Creates a Mainnet vault only from the isolated Mainnet in-memory recovery session. */
export async function createMainnetVaultFromActiveRecovery(pin: string, pinConfirmation: string) {
  try {
    const publicAddress = deriveActiveMainnetRecoveryAddress();
    return await withActiveMainnetRecoveryEntropyAsync((entropy) => withEncodedRecoveryVaultPayloadAsync(
      entropy,
      (payload) => executeMainnetOnboardingWithIdentity({
        createdAt: new Date().toISOString(), payload, pin, pinConfirmation, publicAddress,
      }),
    ));
  } finally {
    destroyActiveMainnetRecoverySecretSession();
  }
}
