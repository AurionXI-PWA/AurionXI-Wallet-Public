import { auditStoredVaultIdentityIntegrity } from './vault-identity-integrity';
import type { VaultIdentityIntegrityAudit } from './vault-identity-integrity-core';
import { recoverOneStartupWalletIdentityTransitionStep } from './wallet-identity-transition-recovery';
import { runWalletIdentityTransitionStartupLifecycle } from './wallet-identity-transition-startup-lifecycle-core';

let startupLifecyclePromise: Promise<VaultIdentityIntegrityAudit> | null = null;

export function runStoredWalletIdentityTransitionStartupLifecycle(): Promise<VaultIdentityIntegrityAudit> {
  startupLifecyclePromise ??= runWalletIdentityTransitionStartupLifecycle({
    auditIdentityIntegrity: auditStoredVaultIdentityIntegrity,
    recoverOneTransitionStep: recoverOneStartupWalletIdentityTransitionStep,
  });
  return startupLifecyclePromise;
}
