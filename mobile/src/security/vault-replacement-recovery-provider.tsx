import { createContext, type PropsWithChildren, useContext, useEffect, useMemo, useState } from 'react';

import type { VaultReplacementRecoveryAudit } from './vault-replacement-journal-core';
import { runStoredVaultReplacementStartupLifecycle } from './vault-replacement-startup-lifecycle';
import type { RetiredPrimaryCleanupPreDeletionAudit } from './retired-primary-cleanup-pre-deletion-audit-core';
import { auditStoredRetiredPrimaryCleanupPreDeletion } from './retired-primary-cleanup-pre-deletion-audit';

type VaultReplacementRecoveryState =
  | { status: 'checking' }
  | { audit: VaultReplacementRecoveryAudit; cleanupAudit: RetiredPrimaryCleanupPreDeletionAudit; status: 'ready' }
  | { status: 'error' };

const VaultReplacementRecoveryContext = createContext<VaultReplacementRecoveryState | null>(null);

export function VaultReplacementRecoveryProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<VaultReplacementRecoveryState>({ status: 'checking' });

  useEffect(() => {
    let active = true;
    void runStoredVaultReplacementStartupLifecycle()
      .then(async (audit) => {
        const cleanupAudit = await auditStoredRetiredPrimaryCleanupPreDeletion();
        if (active) setState({ audit, cleanupAudit, status: 'ready' });
      })
      .catch(() => {
        if (active) setState({ status: 'error' });
      });
    return () => {
      active = false;
    };
  }, []);

  const value = useMemo(() => state, [state]);
  return (
    <VaultReplacementRecoveryContext.Provider value={value}>
      {children}
    </VaultReplacementRecoveryContext.Provider>
  );
}

export function useVaultReplacementRecovery() {
  const value = useContext(VaultReplacementRecoveryContext);
  if (!value) {
    throw new Error('useVaultReplacementRecovery must be used within VaultReplacementRecoveryProvider.');
  }
  return value;
}
