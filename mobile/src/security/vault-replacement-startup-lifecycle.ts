import type { VaultReplacementRecoveryAudit } from './vault-replacement-journal-core';
import { recoverOneStartupVaultReplacementPromotionStep } from './vault-replacement-promotion-recovery';
import { auditStoredVaultReplacementRecovery } from './vault-replacement-recovery';
import { runVaultReplacementStartupLifecycle } from './vault-replacement-startup-lifecycle-core';

let startupLifecyclePromise: Promise<VaultReplacementRecoveryAudit> | null = null;

export function runStoredVaultReplacementStartupLifecycle(): Promise<VaultReplacementRecoveryAudit> {
  startupLifecyclePromise ??= runVaultReplacementStartupLifecycle({
    auditRecovery: auditStoredVaultReplacementRecovery,
    recoverOnePromotionStep: recoverOneStartupVaultReplacementPromotionStep,
  });
  return startupLifecyclePromise;
}
