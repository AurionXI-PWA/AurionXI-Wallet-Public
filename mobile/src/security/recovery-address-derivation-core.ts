export type RecoveryAddressDerivationDependencies = {
  deriveAddress: (phrase: string) => string;
  walletSecretFeatureEnabled: boolean;
  withPhrase: <T>(consumer: (phrase: string) => T) => T;
};

export function deriveActiveRecoveryAddress(
  dependencies: RecoveryAddressDerivationDependencies,
): `0x${string}` {
  if (!dependencies.walletSecretFeatureEnabled) {
    throw new Error('Wallet-secret handling is disabled for this build.');
  }
  const address = dependencies.withPhrase(dependencies.deriveAddress);
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    throw new Error('Recovery address derivation failed closed.');
  }
  return address as `0x${string}`;
}
