import {
  CANONICAL_VAULT_MIGRATION_FRESHNESS_READ_TIMEOUT_MESSAGE,
} from './canonical-vault-migration-freshness-read-timeout-core';

const CANCELLATION_MESSAGE = 'Wallet storage safety verification was cancelled.';

export type CanonicalVaultMigrationInitialReadUnavailableCopy = {
  body: string;
  category: 'cancelled' | 'generic' | 'timed-out';
  title: string;
};

const GENERIC_COPY: CanonicalVaultMigrationInitialReadUnavailableCopy = {
  body: 'Wallet storage safety could not be verified. No change is available.',
  category: 'generic',
  title: 'Optimization unavailable',
};

export function getCanonicalVaultMigrationInitialReadUnavailableCopy(
  error: unknown,
): CanonicalVaultMigrationInitialReadUnavailableCopy {
  if (error instanceof Error && error.message === CANONICAL_VAULT_MIGRATION_FRESHNESS_READ_TIMEOUT_MESSAGE) {
    return {
      body: 'Wallet storage safety check took too long. Please try again.',
      category: 'timed-out',
      title: 'Safety check timed out',
    };
  }
  if (error instanceof Error && error.message === CANCELLATION_MESSAGE) {
    return {
      body: 'Wallet storage safety check was interrupted. Please try again.',
      category: 'cancelled',
      title: 'Safety check interrupted',
    };
  }
  return GENERIC_COPY;
}
