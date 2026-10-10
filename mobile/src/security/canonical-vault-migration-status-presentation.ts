import type { CanonicalVaultMigrationStartupDecision } from './canonical-vault-migration-startup-policy';

export type CanonicalVaultMigrationStatusPresentation = {
  blocksWallet: boolean;
  body: string;
  requiresUserAction: boolean;
  severity: 'information' | 'warning' | 'critical' | 'success';
  title: string;
};

export function getCanonicalVaultMigrationStatusPresentation(
  decision: CanonicalVaultMigrationStartupDecision,
): CanonicalVaultMigrationStatusPresentation {
  if (decision.action === 'await-explicit-start') {
    return {
      blocksWallet: false,
      body: 'Your active wallet is secure. A device-storage optimization is available and will start only with your approval.',
      requiresUserAction: true,
      severity: 'information',
      title: 'Wallet storage optimization available',
    };
  }
  if (decision.action === 'recover-one-safe-step') {
    return {
      blocksWallet: false,
      body: 'A verified wallet-storage transition can safely resume one step after an interrupted session.',
      requiresUserAction: false,
      severity: 'information',
      title: 'Wallet security recovery ready',
    };
  }
  if (decision.action === 'require-explicit-candidate-removal') {
    return {
      blocksWallet: false,
      body: 'The canonical wallet is active and verified. Removing the retired temporary copy requires your explicit approval.',
      requiresUserAction: true,
      severity: 'warning',
      title: 'Secure cleanup approval required',
    };
  }
  if (decision.action === 'report-complete') {
    return {
      blocksWallet: false,
      body: 'The canonical wallet is active and the device-storage transition completed successfully.',
      requiresUserAction: false,
      severity: 'success',
      title: 'Wallet storage secured',
    };
  }
  return {
    blocksWallet: true,
    body: 'Wallet storage safety could not be verified. No automatic wallet change was performed.',
    requiresUserAction: false,
    severity: 'critical',
    title: 'Wallet storage transition locked',
  };
}

