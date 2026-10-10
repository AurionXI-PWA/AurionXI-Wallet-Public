import type { VaultReplacementResumeScope } from './vault-replacement-resume-controller-core';
import type { WalletIdentityRecord } from './wallet-identity-record-core';

export type RecoveryOwnershipDependencies = {
  deriveAddress: (recoveryPhrase: string) => `0x${string}`;
  readIdentity: () => Promise<WalletIdentityRecord | null>;
  validatePhrase: (recoveryPhrase: string) => boolean;
  walletSecretFeatureEnabled: boolean;
};

export class RecoveryOwnershipAuthenticationError extends Error {
  constructor() {
    super('Recovery ownership could not be authenticated.');
    this.name = 'RecoveryOwnershipAuthenticationError';
  }
}

function equalAddress(left: string, right: string): boolean {
  const normalizedLeft = left.toLowerCase();
  const normalizedRight = right.toLowerCase();
  if (normalizedLeft.length !== normalizedRight.length) return false;
  let difference = 0;
  for (let index = 0; index < normalizedLeft.length; index += 1) {
    difference |= normalizedLeft.charCodeAt(index) ^ normalizedRight.charCodeAt(index);
  }
  return difference === 0;
}

export async function authenticateRecoveryOwnership(
  recoveryPhrase: string,
  scope: VaultReplacementResumeScope,
  dependencies: RecoveryOwnershipDependencies,
): Promise<void> {
  try {
    if (!dependencies.walletSecretFeatureEnabled || scope.targetStatus !== 'corrupt') {
      throw new Error('blocked');
    }
    const identity = await dependencies.readIdentity();
    if (!identity || !dependencies.validatePhrase(recoveryPhrase)) throw new Error('invalid');
    const derivedAddress = dependencies.deriveAddress(recoveryPhrase);
    if (!equalAddress(derivedAddress, identity.publicAddress)) throw new Error('mismatch');
  } catch {
    throw new RecoveryOwnershipAuthenticationError();
  }
}
