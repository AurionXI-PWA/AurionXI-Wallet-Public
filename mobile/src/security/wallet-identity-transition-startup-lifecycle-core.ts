import type { VaultIdentityIntegrityAudit } from './vault-identity-integrity-core';
import type { WalletIdentityTransitionRecoveryResult } from './wallet-identity-transition-recovery-core';

export type WalletIdentityTransitionStartupLifecycleDependencies = {
  auditIdentityIntegrity: () => Promise<VaultIdentityIntegrityAudit>;
  recoverOneTransitionStep: () => Promise<WalletIdentityTransitionRecoveryResult>;
};

export async function runWalletIdentityTransitionStartupLifecycle(
  dependencies: WalletIdentityTransitionStartupLifecycleDependencies,
): Promise<VaultIdentityIntegrityAudit> {
  await dependencies.recoverOneTransitionStep();
  return dependencies.auditIdentityIntegrity();
}
