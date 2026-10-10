import { createContext, type PropsWithChildren, useContext, useEffect, useMemo, useState } from 'react';

import { auditStoredCanonicalVaultMigration } from './canonical-vault-migration-audit';
import { loadCanonicalVaultMigrationStatus } from './canonical-vault-migration-status-loader-core';
import type { CanonicalVaultMigrationStartupDecision } from './canonical-vault-migration-startup-policy';
import {
  getCanonicalVaultMigrationStatusPresentation,
  type CanonicalVaultMigrationStatusPresentation,
} from './canonical-vault-migration-status-presentation';

export type CanonicalVaultMigrationStatusState =
  | { status: 'checking' }
  | {
      decision: CanonicalVaultMigrationStartupDecision;
      presentation: CanonicalVaultMigrationStatusPresentation;
      status: 'ready';
    }
  | {
      presentation: CanonicalVaultMigrationStatusPresentation;
      status: 'error';
    };

const lockedPresentation = getCanonicalVaultMigrationStatusPresentation({
  action: 'report-locked',
  state: 'inconsistent',
});

const CanonicalVaultMigrationStatusContext = createContext<CanonicalVaultMigrationStatusState | null>(null);

export function CanonicalVaultMigrationStatusProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<CanonicalVaultMigrationStatusState>({ status: 'checking' });

  useEffect(() => {
    let active = true;
    void loadCanonicalVaultMigrationStatus(auditStoredCanonicalVaultMigration)
      .then((result) => {
        if (active) setState({ ...result, status: 'ready' });
      })
      .catch(() => {
        if (active) setState({ presentation: lockedPresentation, status: 'error' });
      });
    return () => { active = false; };
  }, []);

  const value = useMemo(() => state, [state]);
  return (
    <CanonicalVaultMigrationStatusContext.Provider value={value}>
      {children}
    </CanonicalVaultMigrationStatusContext.Provider>
  );
}

export function useCanonicalVaultMigrationStatus() {
  const value = useContext(CanonicalVaultMigrationStatusContext);
  if (!value) {
    throw new Error('useCanonicalVaultMigrationStatus must be used within CanonicalVaultMigrationStatusProvider.');
  }
  return value;
}

