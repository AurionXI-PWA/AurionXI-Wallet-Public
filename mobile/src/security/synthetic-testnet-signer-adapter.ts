import type { ValidatedTransactionIntent } from './transaction-intent-policy';

export type SyntheticSignerStatus =
  | { available: false; reason: 'debug-build-required' | 'wallet-secrets-disabled' | 'signing-disabled' };

export type SyntheticTestnetSignerAdapter = {
  getStatus(): SyntheticSignerStatus;
  sign(_intent: ValidatedTransactionIntent): Promise<never>;
};

type SyntheticSignerAdapterInput = {
  debugBuild: boolean;
  walletSecretsEnabled: boolean;
  signingEnabled: boolean;
};

/**
 * Intentional fail-closed placeholder for a future synthetic Testnet signer.
 * It does not create, load, retain, or use account material; it never signs or broadcasts.
 */
export function createSyntheticTestnetSignerAdapter(
  input: SyntheticSignerAdapterInput,
): SyntheticTestnetSignerAdapter {
  const status: SyntheticSignerStatus = !input.debugBuild
    ? { available: false, reason: 'debug-build-required' }
    : !input.walletSecretsEnabled
      ? { available: false, reason: 'wallet-secrets-disabled' }
      : { available: false, reason: 'signing-disabled' };

  return {
    getStatus: () => status,
    sign: async () => {
      throw new Error('Synthetic Testnet signing is not enabled in this build.');
    },
  };
}
