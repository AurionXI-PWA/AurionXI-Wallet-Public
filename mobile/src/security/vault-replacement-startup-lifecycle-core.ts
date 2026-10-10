import type { VaultReplacementRecoveryAudit } from './vault-replacement-journal-core';
import type { VaultReplacementPromotionRecoveryResult } from './vault-replacement-promotion-recovery-core';

export type VaultReplacementStartupLifecycleDependencies = {
  auditRecovery: () => Promise<VaultReplacementRecoveryAudit>;
  recoverOnePromotionStep: () => Promise<VaultReplacementPromotionRecoveryResult>;
};

export async function runVaultReplacementStartupLifecycle(
  dependencies: VaultReplacementStartupLifecycleDependencies,
): Promise<VaultReplacementRecoveryAudit> {
  const recovery = await dependencies.recoverOnePromotionStep();
  if (recovery.action === 'fail-closed') {
    throw new Error('Startup wallet replacement recovery failed closed.');
  }
  return dependencies.auditRecovery();
}
