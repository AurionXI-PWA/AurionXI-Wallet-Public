import { describe, expect, it } from 'vitest';

import {
  CANONICAL_VAULT_MIGRATION_START_CONFIRMATION,
  type CanonicalVaultMigrationStartAuthorization,
} from './canonical-vault-migration-start-authorization';
import { getCanonicalVaultMigrationStartUiModel } from './canonical-vault-migration-start-ui-model';

const scope = {
  candidateCreatedAt: '2026-08-09T00:00:00.000Z',
  candidatePublicAddress: '0x2222222222222222222222222222222222222222' as const,
  replacementTransactionId: 'a'.repeat(32),
};

const cases: readonly (readonly [
  CanonicalVaultMigrationStartAuthorization,
  string,
  string,
])[] = [
  [{ stage: 'idle' }, 'Wallet storage optimization', 'none'],
  [{ stage: 'blocked' }, 'Optimization unavailable', 'none'],
  [{ scope, stage: 'awaiting-pin' }, 'Verify wallet access', 'verify-pin'],
  [{ authorizationExpiresAt: 61_000, scope, stage: 'awaiting-confirmation' }, 'Confirm storage optimization', 'confirm-authorization'],
  [{ authorizationExpiresAt: 61_000, scope, stage: 'authorized' }, 'Optimization authorized', 'submit-authorized-start'],
];

describe('canonical migration start English UI state foundation', () => {
  it.each(cases)('maps %s to stable screen copy and action intent', (authorization, title, primaryAction) => {
    expect(getCanonicalVaultMigrationStartUiModel(authorization)).toEqual(expect.objectContaining({
      primaryAction,
      title,
    }));
  });

  it('shows the exact phrase only during confirmation', () => {
    for (const [authorization] of cases) {
      const model = getCanonicalVaultMigrationStartUiModel(authorization);
      expect(model.confirmationPhrase).toBe(
        authorization.stage === 'awaiting-confirmation'
          ? CANONICAL_VAULT_MIGRATION_START_CONFIRMATION
          : undefined,
      );
    }
  });

  it('does not expose scoped address, transaction, encrypted data, or secret values', () => {
    for (const [authorization] of cases) {
      const serialized = JSON.stringify(getCanonicalVaultMigrationStartUiModel(authorization));
      expect(serialized).not.toContain(scope.candidatePublicAddress);
      expect(serialized).not.toContain(scope.replacementTransactionId);
      expect(serialized).not.toMatch(/ciphertext|private key|recovery phrase|mnemonic|seed/i);
    }
  });

  it('provides no executable function or navigation route', () => {
    for (const [authorization] of cases) {
      const model = getCanonicalVaultMigrationStartUiModel(authorization);
      expect(Object.values(model).some((value) => typeof value === 'function')).toBe(false);
      expect(model).not.toHaveProperty('route');
      expect(model).not.toHaveProperty('onPress');
    }
  });
});
