import { describe, expect, it } from 'vitest';

import { CANONICAL_VAULT_MIGRATION_FRESHNESS_READ_TIMEOUT_MESSAGE } from './canonical-vault-migration-freshness-read-timeout-core';
import { getCanonicalVaultMigrationInitialReadUnavailableCopy } from './canonical-vault-migration-initial-read-unavailable-copy-core';

describe('canonical migration initial freshness unavailable copy', () => {
  it('maps the owned timeout boundary to fixed recovery copy', () => {
    expect(getCanonicalVaultMigrationInitialReadUnavailableCopy(
      new Error(CANONICAL_VAULT_MIGRATION_FRESHNESS_READ_TIMEOUT_MESSAGE),
    )).toEqual({
      body: 'Wallet storage safety check took too long. Please try again.',
      category: 'timed-out',
      title: 'Safety check timed out',
    });
  });

  it('maps the owned cancellation boundary to fixed recovery copy', () => {
    expect(getCanonicalVaultMigrationInitialReadUnavailableCopy(
      new Error('Wallet storage safety verification was cancelled.'),
    )).toEqual({
      body: 'Wallet storage safety check was interrupted. Please try again.',
      category: 'cancelled',
      title: 'Safety check interrupted',
    });
  });

  it('does not expose arbitrary error text in generic recovery copy', () => {
    const hostileError = new Error('vault=/private/key pin=123456 snapshot=secret');
    const copy = getCanonicalVaultMigrationInitialReadUnavailableCopy(hostileError);
    expect(copy).toEqual({
      body: 'Wallet storage safety could not be verified. No change is available.',
      category: 'generic',
      title: 'Optimization unavailable',
    });
    expect(JSON.stringify(copy)).not.toContain(hostileError.message);
  });
});
