import { createContext, type PropsWithChildren, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import type { VaultIdentityIntegrityAudit } from './vault-identity-integrity-core';
import { auditStoredVaultIdentityIntegrity } from './vault-identity-integrity';
import { runStoredWalletIdentityTransitionStartupLifecycle } from './wallet-identity-transition-startup-lifecycle';

type VaultIdentityIntegrityState =
  | { status: 'checking' }
  | { audit: VaultIdentityIntegrityAudit; status: 'ready' }
  | { status: 'error' };

type VaultIdentityIntegrityContextValue = VaultIdentityIntegrityState & {
  refresh: () => Promise<void>;
};

const Context = createContext<VaultIdentityIntegrityContextValue | null>(null);

export function VaultIdentityIntegrityProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<VaultIdentityIntegrityState>({ status: 'checking' });
  const refresh = useCallback(async () => {
    setState({ status: 'checking' });
    try {
      const audit = await auditStoredVaultIdentityIntegrity();
      setState({ audit, status: 'ready' });
    } catch {
      setState({ status: 'error' });
    }
  }, []);
  useEffect(() => {
    let active = true;
    void runStoredWalletIdentityTransitionStartupLifecycle()
      .then((audit) => { if (active) setState({ audit, status: 'ready' }); })
      .catch(() => { if (active) setState({ status: 'error' }); });
    return () => { active = false; };
  }, []);
  const value = useMemo(() => ({ ...state, refresh }), [refresh, state]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useVaultIdentityIntegrity() {
  const value = useContext(Context);
  if (!value) throw new Error('useVaultIdentityIntegrity must be used within VaultIdentityIntegrityProvider.');
  return value;
}
