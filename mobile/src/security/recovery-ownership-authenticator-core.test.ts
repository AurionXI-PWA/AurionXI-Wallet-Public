import { describe, expect, it, vi } from 'vitest';

import {
  authenticateRecoveryOwnership,
  RecoveryOwnershipAuthenticationError,
} from './recovery-ownership-authenticator-core';
import { createWalletIdentityRecord } from './wallet-identity-record-core';

const phrase = 'synthetic valid recovery phrase';
const address = '0x0000000000000000000000000000000000000001' as const;
const identity = createWalletIdentityRecord(address, '2026-08-09T00:00:00.000Z');
const scope = {
  candidatePublicAddress: '0x0000000000000000000000000000000000000002' as const,
  targetStatus: 'corrupt' as const,
  transactionId: 'a'.repeat(32),
};

function dependencies() {
  return {
    deriveAddress: vi.fn().mockReturnValue(address),
    readIdentity: vi.fn().mockResolvedValue(identity),
    validatePhrase: vi.fn().mockReturnValue(true),
    walletSecretFeatureEnabled: true,
  };
}

describe('recovery ownership binding', () => {
  it('accepts only a checksum-validated phrase deriving the authoritative identity', async () => {
    const deps = dependencies();
    await expect(authenticateRecoveryOwnership(phrase, scope, deps)).resolves.toBeUndefined();
    expect(deps.validatePhrase).toHaveBeenCalledWith(phrase);
    expect(deps.deriveAddress).toHaveBeenCalledWith(phrase);
  });

  it.each([
    'feature-disabled',
    'wrong-target',
    'missing-identity',
    'invalid-phrase',
    'address-mismatch',
    'identity-read-error',
  ])('fails closed with a generic error for %s', async (condition) => {
    const deps = dependencies();
    const activeScope = { ...scope };
    if (condition === 'feature-disabled') deps.walletSecretFeatureEnabled = false;
    if (condition === 'wrong-target') activeScope.targetStatus = 'present' as never;
    if (condition === 'missing-identity') deps.readIdentity.mockResolvedValue(null);
    if (condition === 'invalid-phrase') deps.validatePhrase.mockReturnValue(false);
    if (condition === 'address-mismatch') deps.deriveAddress.mockReturnValue('0x0000000000000000000000000000000000000003');
    if (condition === 'identity-read-error') deps.readIdentity.mockRejectedValue(new Error('storage detail'));
    await expect(authenticateRecoveryOwnership(phrase, activeScope, deps)).rejects.toEqual(
      new RecoveryOwnershipAuthenticationError(),
    );
  });

  it('does not derive an address when validation or identity lookup fails', async () => {
    const invalid = dependencies();
    invalid.validatePhrase.mockReturnValue(false);
    await expect(authenticateRecoveryOwnership(phrase, scope, invalid)).rejects.toThrow();
    expect(invalid.deriveAddress).not.toHaveBeenCalled();

    const missing = dependencies();
    missing.readIdentity.mockResolvedValue(null);
    await expect(authenticateRecoveryOwnership(phrase, scope, missing)).rejects.toThrow();
    expect(missing.validatePhrase).not.toHaveBeenCalled();
    expect(missing.deriveAddress).not.toHaveBeenCalled();
  });
});
