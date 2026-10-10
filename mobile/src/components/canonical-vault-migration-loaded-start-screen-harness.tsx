import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, AppState, Pressable, StyleSheet, Text, View } from 'react-native';

import { CanonicalVaultMigrationStartScreenHarness } from '@/components/canonical-vault-migration-start-screen-harness';
import type { CanonicalVaultMigrationSnapshot } from '@/security/canonical-vault-migration-policy';
import {
  createFreshSnapshotCanonicalVaultMigrationPinVerifier,
  recheckCanonicalVaultMigrationSnapshotScope,
} from '@/security/canonical-vault-migration-fresh-snapshot-pin-verifier-core';
import { CanonicalVaultMigrationFreshnessAttemptGate } from '@/security/canonical-vault-migration-freshness-attempt-gate-core';
import { CanonicalVaultMigrationInitialReadAppStateCoordinator } from '@/security/canonical-vault-migration-initial-read-app-state-coordinator-core';
import { isCanonicalVaultMigrationInitialReadAppActive } from '@/security/canonical-vault-migration-initial-read-cold-start-core';
import { createCanonicalVaultMigrationInitialReadLifecycleDisposer } from '@/security/canonical-vault-migration-initial-read-lifecycle-disposer-core';
import { getCanonicalVaultMigrationInitialReadRetryAccessibility } from '@/security/canonical-vault-migration-initial-read-retry-accessibility-core';
import { getCanonicalVaultMigrationInitialReadRetryState } from '@/security/canonical-vault-migration-initial-read-retry-core';
import { CanonicalVaultMigrationInitialReadRetryRequestGate } from '@/security/canonical-vault-migration-initial-read-retry-request-gate-core';
import {
  getCanonicalVaultMigrationInitialReadUnavailableCopy,
  type CanonicalVaultMigrationInitialReadUnavailableCopy,
} from '@/security/canonical-vault-migration-initial-read-unavailable-copy-core';

type LoaderState =
  | { isRetrying: boolean; status: 'loading' }
  | { status: 'ready'; snapshot: CanonicalVaultMigrationSnapshot }
  | { status: 'unavailable'; copy: CanonicalVaultMigrationInitialReadUnavailableCopy };

export type CanonicalVaultMigrationLoadedStartScreenHarnessProps = {
  authenticatePin: (pin: string, signal: AbortSignal) => Promise<void>;
  loadEligibleSnapshot: (signal?: AbortSignal) => Promise<CanonicalVaultMigrationSnapshot>;
};

type ReadyHarnessProps = CanonicalVaultMigrationLoadedStartScreenHarnessProps & {
  snapshot: CanonicalVaultMigrationSnapshot;
};

function ReadyHarness({ authenticatePin, loadEligibleSnapshot, snapshot }: ReadyHarnessProps) {
  const freshSnapshotPinVerifier = useMemo(
    () => createFreshSnapshotCanonicalVaultMigrationPinVerifier(snapshot, loadEligibleSnapshot, authenticatePin),
    [authenticatePin, loadEligibleSnapshot, snapshot],
  );
  const recheckConfirmation = useMemo(
    () => (signal: AbortSignal) => recheckCanonicalVaultMigrationSnapshotScope(snapshot, loadEligibleSnapshot, signal),
    [loadEligibleSnapshot, snapshot],
  );
  const recheckAuthorizedStart = useMemo(
    () => (signal: AbortSignal) => recheckCanonicalVaultMigrationSnapshotScope(snapshot, loadEligibleSnapshot, signal),
    [loadEligibleSnapshot, snapshot],
  );
  return (
    <CanonicalVaultMigrationStartScreenHarness
      authenticatePin={freshSnapshotPinVerifier}
      recheckAuthorizedStart={recheckAuthorizedStart}
      recheckConfirmation={recheckConfirmation}
      snapshot={snapshot}
    />
  );
}

export function CanonicalVaultMigrationLoadedStartScreenHarness({
  authenticatePin,
  loadEligibleSnapshot,
}: CanonicalVaultMigrationLoadedStartScreenHarnessProps) {
  const [loaderState, setLoaderState] = useState<LoaderState>({ isRetrying: false, status: 'loading' });
  const [initialReadAttemptGate] = useState(() => new CanonicalVaultMigrationFreshnessAttemptGate());
  const [appStateCoordinator] = useState(
    () => new CanonicalVaultMigrationInitialReadAppStateCoordinator(
      isCanonicalVaultMigrationInitialReadAppActive(AppState.currentState),
    ),
  );
  const [appIsActive, setAppIsActive] = useState(
    () => isCanonicalVaultMigrationInitialReadAppActive(AppState.currentState),
  );
  const [retryRequestGate] = useState(() => new CanonicalVaultMigrationInitialReadRetryRequestGate());
  const [readSequence, setReadSequence] = useState(0);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        if (!appStateCoordinator.foreground()) return;
        initialReadAttemptGate.invalidate();
        setLoaderState({ isRetrying: false, status: 'loading' });
        setReadSequence((current) => current + 1);
        setAppIsActive(true);
        return;
      }
      if (!appStateCoordinator.background()) return;
      initialReadAttemptGate.invalidate();
      setAppIsActive(false);
    });
    const disposer = createCanonicalVaultMigrationInitialReadLifecycleDisposer(() => subscription.remove());
    return disposer.dispose;
  }, [appStateCoordinator, initialReadAttemptGate]);

  useEffect(() => {
    if (!appIsActive) return undefined;
    retryRequestGate.release();
    const attempt = initialReadAttemptGate.begin();
    const abortController = new AbortController();
    void loadEligibleSnapshot(abortController.signal).then(
      (snapshot) => { if (attempt.isCurrent()) setLoaderState({ snapshot, status: 'ready' }); },
      (error) => {
        if (attempt.isCurrent()) {
          setLoaderState({ copy: getCanonicalVaultMigrationInitialReadUnavailableCopy(error), status: 'unavailable' });
        }
      },
    );
    return () => {
      abortController.abort();
      attempt.retire();
    };
  }, [appIsActive, initialReadAttemptGate, loadEligibleSnapshot, readSequence, retryRequestGate]);

  const retryInitialRead = () => {
    if (!retryRequestGate.tryBegin()) return;
    const retry = getCanonicalVaultMigrationInitialReadRetryState(initialReadAttemptGate, readSequence);
    setLoaderState(retry.loaderState);
    setReadSequence(retry.readSequence);
  };

  if (loaderState.status === 'ready') {
    return <ReadyHarness authenticatePin={authenticatePin} loadEligibleSnapshot={loadEligibleSnapshot} snapshot={loaderState.snapshot} />;
  }
  const retryIsBusy = loaderState.status === 'loading' && loaderState.isRetrying;
  const showRetryAction = loaderState.status === 'unavailable' || retryIsBusy;
  const retryAccessibility = getCanonicalVaultMigrationInitialReadRetryAccessibility(retryIsBusy);
  return (
    <View style={styles.screen}>
      {loaderState.status === 'loading' ? (
        <View accessibilityLabel={retryIsBusy ? 'Retrying wallet storage safety check' : 'Checking wallet storage safety'} accessibilityRole="progressbar" accessibilityState={{ busy: true }}>
          <ActivityIndicator color="#7cf6bd" />
        </View>
      ) : null}
      <Text style={styles.title}>{loaderState.status === 'loading' ? 'Checking wallet storage safety' : loaderState.copy.title}</Text>
      <Text style={styles.body}>{loaderState.status === 'loading' ? 'Verifying the latest local wallet storage state.' : loaderState.copy.body}</Text>
      {showRetryAction ? (
        <Pressable accessibilityHint={retryAccessibility.accessibilityHint} accessibilityLabel={retryAccessibility.accessibilityLabel} accessibilityRole="button" accessibilityState={retryAccessibility.accessibilityState} disabled={retryIsBusy} onPress={retryInitialRead} style={[styles.retryButton, retryIsBusy ? styles.retryButtonDisabled : null]}>
          <Text style={[styles.retryButtonText, retryIsBusy ? styles.retryButtonTextDisabled : null]}>{retryAccessibility.actionText}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  body: { color: '#9eb2a9', fontSize: 15, lineHeight: 23, marginTop: 12, textAlign: 'center' },
  retryButton: { borderColor: '#7cf6bd', borderRadius: 12, borderWidth: 1, marginTop: 24, paddingHorizontal: 18, paddingVertical: 12 },
  retryButtonDisabled: { borderColor: '#4c7161' },
  retryButtonText: { color: '#7cf6bd', fontSize: 15, fontWeight: '800' },
  retryButtonTextDisabled: { color: '#789487' },
  screen: { alignItems: 'center', backgroundColor: '#071310', flex: 1, justifyContent: 'center', padding: 24 },
  title: { color: '#f6fbf8', fontSize: 24, fontWeight: '800', marginTop: 16, textAlign: 'center' },
});
