import {
  CANONICAL_VAULT_MIGRATION_START_CONFIRMATION,
  type CanonicalVaultMigrationStartAuthorization,
} from './canonical-vault-migration-start-authorization';

export type CanonicalVaultMigrationStartUiModel = {
  body: string;
  confirmationPhrase?: string;
  input: 'none' | 'pin' | 'confirmation';
  primaryAction: 'none' | 'verify-pin' | 'confirm-authorization' | 'submit-authorized-start';
  severity: 'information' | 'warning' | 'success' | 'critical';
  title: string;
};

export function getCanonicalVaultMigrationStartUiModel(
  authorization: CanonicalVaultMigrationStartAuthorization,
): CanonicalVaultMigrationStartUiModel {
  if (authorization.stage === 'idle') {
    return {
      body: 'Review the wallet storage safety status before starting an optimization.',
      input: 'none',
      primaryAction: 'none',
      severity: 'information',
      title: 'Wallet storage optimization',
    };
  }
  if (authorization.stage === 'blocked') {
    return {
      body: 'Wallet storage safety could not be verified. No change is available.',
      input: 'none',
      primaryAction: 'none',
      severity: 'critical',
      title: 'Optimization unavailable',
    };
  }
  if (authorization.stage === 'awaiting-pin') {
    return {
      body: 'Enter your active wallet PIN to continue. Your PIN is verified locally and is not stored by this flow.',
      input: 'pin',
      primaryAction: 'verify-pin',
      severity: 'information',
      title: 'Verify wallet access',
    };
  }
  if (authorization.stage === 'awaiting-confirmation') {
    return {
      body: 'Type the exact confirmation shown below. Authorization expires shortly.',
      confirmationPhrase: CANONICAL_VAULT_MIGRATION_START_CONFIRMATION,
      input: 'confirmation',
      primaryAction: 'confirm-authorization',
      severity: 'warning',
      title: 'Confirm storage optimization',
    };
  }
  return {
    body: 'Authorization is ready for one final fresh safety check before recording the migration intent.',
    input: 'none',
    primaryAction: 'submit-authorized-start',
    severity: 'success',
    title: 'Optimization authorized',
  };
}

