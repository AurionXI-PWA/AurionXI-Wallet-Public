import type { VaultReplacementRecoveryAudit } from './vault-replacement-journal-core';
import type { RetiredPrimaryCleanupPreDeletionAudit } from './retired-primary-cleanup-pre-deletion-audit-core';

export type VaultReplacementRecoveryPresentation = {
  body: string;
  blocksReplacement: boolean;
  severity: 'information' | 'warning' | 'critical';
  title: string;
};

export function getVaultReplacementRecoveryPresentation(
  audit: VaultReplacementRecoveryAudit | 'audit-error',
  cleanupAudit?: RetiredPrimaryCleanupPreDeletionAudit,
): VaultReplacementRecoveryPresentation | null {
  if (audit !== 'audit-error' && audit.state === 'clean') return null;

  if (audit === 'audit-error') {
    return {
      body: 'Replacement safety could not be verified. Existing encrypted wallet data was not changed.',
      blocksReplacement: true,
      severity: 'critical',
      title: 'Wallet replacement is locked',
    };
  }
  if (audit.state === 'resumable') {
    return {
      body: 'A verified replacement candidate is waiting for a future authenticated resume step. No wallet data was promoted or deleted.',
      blocksReplacement: true,
      severity: 'information',
      title: 'Wallet replacement paused safely',
    };
  }
  if (audit.state === 'promotion-recovery') {
    return {
      body: 'An authenticated wallet replacement is being recovered from durable records. Existing wallet data has not been deleted.',
      blocksReplacement: true,
      severity: 'information',
      title: 'Wallet replacement recovery in progress',
    };
  }
  if (audit.state === 'cleanup-pending') {
    if (cleanupAudit?.state === 'finalized' && cleanupAudit.action === 'complete') {
      return {
        body: 'The replacement wallet is active and retired wallet cleanup completed successfully.',
        blocksReplacement: false,
        severity: 'information',
        title: 'Secure cleanup complete',
      };
    }
    return {
      body: 'The replacement wallet is active. Retired wallet cleanup requires a separate authenticated security step.',
      blocksReplacement: true,
      severity: 'information',
      title: 'Secure cleanup is pending',
    };
  }
  if (audit.state === 'candidate-without-journal') {
    return {
      body: 'Untracked candidate data is quarantined. It cannot replace the active wallet.',
      blocksReplacement: true,
      severity: 'warning',
      title: 'Unverified replacement data detected',
    };
  }
  if (audit.state === 'journal-without-candidate') {
    return {
      body: 'A stale replacement journal was detected. No automatic cleanup or wallet change was performed.',
      blocksReplacement: true,
      severity: 'warning',
      title: 'Incomplete replacement record detected',
    };
  }
  return {
    body: 'Replacement records are inconsistent or use an unsupported phase. Existing encrypted wallet data remains unchanged.',
    blocksReplacement: true,
    severity: 'critical',
    title: 'Wallet replacement is locked',
  };
}
