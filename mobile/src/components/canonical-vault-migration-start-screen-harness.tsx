import { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';

import { CanonicalVaultMigrationStartScreen } from '@/components/canonical-vault-migration-start-screen';
import type { CanonicalVaultMigrationLocalSubmitEvent } from '@/security/canonical-vault-migration-local-submit-policy';
import type { CanonicalVaultMigrationSnapshot } from '@/security/canonical-vault-migration-policy';
import { CanonicalVaultMigrationStartAppStateCoordinator } from '@/security/canonical-vault-migration-start-app-state-coordinator-core';
import { CanonicalVaultMigrationStartExpiryScheduler } from '@/security/canonical-vault-migration-start-expiry-scheduler-core';
import {
  getCanonicalVaultMigrationRetryStartedViewState,
  recoverCanonicalVaultMigrationCallbackFailureViewState,
} from '@/security/canonical-vault-migration-start-failure-ui-signal-core';
import { CanonicalVaultMigrationStartParentSession } from '@/security/canonical-vault-migration-start-parent-session-core';

type CanonicalVaultMigrationStartScreenHarnessProps = {
  authenticatePin: (pin: string, signal: AbortSignal) => Promise<void>;
  recheckAuthorizedStart?: (signal: AbortSignal) => Promise<void>;
  recheckConfirmation?: (signal: AbortSignal) => Promise<void>;
  snapshot: CanonicalVaultMigrationSnapshot;
};

function createSessionExpiryScheduler(_session: CanonicalVaultMigrationStartParentSession) {
  return new CanonicalVaultMigrationStartExpiryScheduler();
}

export function CanonicalVaultMigrationStartScreenHarness({
  authenticatePin,
  recheckAuthorizedStart,
  recheckConfirmation,
  snapshot,
}: CanonicalVaultMigrationStartScreenHarnessProps) {
  const session = useMemo(
    () => new CanonicalVaultMigrationStartParentSession(
      authenticatePin,
      snapshot,
      undefined,
      recheckConfirmation ?? null,
      recheckAuthorizedStart ?? null,
    ),
    [authenticatePin, recheckAuthorizedStart, recheckConfirmation, snapshot],
  );
  const expiryScheduler = useMemo(
    () => createSessionExpiryScheduler(session),
    [session],
  );
  const [published, setPublished] = useState<{
    session: CanonicalVaultMigrationStartParentSession;
    state: typeof session.initialState;
  } | null>(null);
  const publishState = useCallback(
    (state: typeof session.initialState) => setPublished({ session, state }),
    [session],
  );
  const reportCallbackFailure = useCallback(() => {
    setPublished({
      session,
      state: recoverCanonicalVaultMigrationCallbackFailureViewState(
        () => session.restartAuthorization(),
        session.initialState,
      ),
    });
  }, [session]);
  const appStateCoordinator = useMemo(
    () => new CanonicalVaultMigrationStartAppStateCoordinator(
      session,
      expiryScheduler,
      reportCallbackFailure,
    ),
    [expiryScheduler, reportCallbackFailure, session],
  );
  useLayoutEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') appStateCoordinator.foreground(Date.now(), publishState);
      else appStateCoordinator.background();
    });
    if (AppState.currentState === 'active') {
      appStateCoordinator.foreground(Date.now(), publishState);
    } else {
      appStateCoordinator.background();
    }
    return () => {
      subscription.remove();
      appStateCoordinator.dispose();
    };
  }, [appStateCoordinator, publishState]);
  const onSubmit = useCallback((event: CanonicalVaultMigrationLocalSubmitEvent) => {
    const now = Date.now();
    if (event.type === 'VERIFY_PIN_REQUESTED') {
      setPublished((current) => {
        const currentState = current?.session === session ? current.state : session.initialState;
        return {
          session,
          state: getCanonicalVaultMigrationRetryStartedViewState(currentState, event.type),
        };
      });
    }
    void session.submit(event, publishState, now).then((result) => {
      if (result && event.type === 'VERIFY_PIN_REQUESTED') {
        appStateCoordinator.recordPinAuthorization(now, publishState);
      }
    });
  }, [appStateCoordinator, publishState, session]);
  const state = published?.session === session ? published.state : session.initialState;

  return <CanonicalVaultMigrationStartScreen onSubmit={onSubmit} state={state} />;
}
