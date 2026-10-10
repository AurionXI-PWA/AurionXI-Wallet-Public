import { Redirect, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Button, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { RetiredPrimaryCleanupPreDeletionAudit } from '@/security/retired-primary-cleanup-pre-deletion-audit-core';
import { auditStoredRetiredPrimaryCleanupPreDeletion } from '@/security/retired-primary-cleanup-pre-deletion-audit';
import { recoverOneStartupRetiredPrimaryCleanupStep } from '@/security/retired-primary-cleanup-recovery';
import { useSensitiveScreenProtection } from '@/security/use-sensitive-screen-protection';

type ExecutionState =
  | { status: 'checking' }
  | { audit: RetiredPrimaryCleanupPreDeletionAudit; status: 'ready' }
  | { status: 'executing' }
  | { audit: RetiredPrimaryCleanupPreDeletionAudit; operation: 'removal' | 'phase-advance' | 'finalization'; status: 'complete' }
  | { status: 'error' };

export default function RetiredWalletCleanupExecutionScreen() {
  useSensitiveScreenProtection();
  const router = useRouter();
  const mounted = useRef(true);
  const executionStarted = useRef(false);
  const [state, setState] = useState<ExecutionState>({ status: 'checking' });

  useEffect(() => {
    mounted.current = true;
    void auditStoredRetiredPrimaryCleanupPreDeletion()
      .then((audit) => {
        if (mounted.current) setState({ audit, status: 'ready' });
      })
      .catch(() => {
        if (mounted.current) setState({ status: 'error' });
      });
    return () => { mounted.current = false; };
  }, []);

  if (!__DEV__) return <Redirect href="/wallet" />;

  const deletionEligible = state.status === 'ready' &&
    state.audit.state === 'intent-primary-present' &&
    state.audit.action === 'resume-cleanup';
  const phaseAdvanceEligible = state.status === 'ready' &&
    state.audit.state === 'intent-primary-absent' &&
    state.audit.action === 'advance-journal';
  const finalizationEligible = state.status === 'ready' &&
    state.audit.state === 'primary-removed' &&
    state.audit.action === 'advance-journal';

  async function executeVerifiedCleanup() {
    if (!deletionEligible || executionStarted.current) return;
    executionStarted.current = true;
    setState({ status: 'executing' });
    try {
      const result = await recoverOneStartupRetiredPrimaryCleanupStep();
      if (result.action !== 'advance-durable-cleanup') throw new Error('Unexpected cleanup recovery result.');
      const audit = await auditStoredRetiredPrimaryCleanupPreDeletion();
      if (audit.state !== 'intent-primary-absent' || audit.action !== 'advance-journal') {
        throw new Error('Retired primary removal did not reach the verified recovery state.');
      }
      if (mounted.current) setState({ audit, operation: 'removal', status: 'complete' });
    } catch {
      if (mounted.current) setState({ status: 'error' });
    }
  }

  async function advanceVerifiedRecoveryPhase() {
    if (!phaseAdvanceEligible || executionStarted.current) return;
    executionStarted.current = true;
    setState({ status: 'executing' });
    try {
      const result = await recoverOneStartupRetiredPrimaryCleanupStep();
      if (result.action !== 'advance-durable-cleanup') throw new Error('Unexpected cleanup recovery result.');
      const audit = await auditStoredRetiredPrimaryCleanupPreDeletion();
      if (audit.state !== 'primary-removed' || audit.action !== 'advance-journal') {
        throw new Error('Cleanup journal did not reach primary-removed.');
      }
      if (mounted.current) setState({ audit, operation: 'phase-advance', status: 'complete' });
    } catch {
      if (mounted.current) setState({ status: 'error' });
    }
  }

  async function finalizeVerifiedCleanup() {
    if (!finalizationEligible || executionStarted.current) return;
    executionStarted.current = true;
    setState({ status: 'executing' });
    try {
      const result = await recoverOneStartupRetiredPrimaryCleanupStep();
      if (result.action !== 'advance-durable-cleanup') throw new Error('Unexpected cleanup recovery result.');
      const audit = await auditStoredRetiredPrimaryCleanupPreDeletion();
      if (audit.state !== 'finalized' || audit.action !== 'complete') {
        throw new Error('Cleanup journal did not reach finalized.');
      }
      if (mounted.current) setState({ audit, operation: 'finalization', status: 'complete' });
    } catch {
      if (mounted.current) setState({ status: 'error' });
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content}>
        <Text style={styles.eyebrow}>DEBUG · DESTRUCTIVE TEST</Text>
        <Text accessibilityRole="header" style={styles.title}>Verified cleanup execution</Text>
        <Text style={styles.body}>This one-step operation permanently removes only the retired encrypted primary slot after a fresh scope verification.</Text>

        {state.status === 'checking' || state.status === 'executing' ? (
          <View accessibilityLiveRegion="polite" style={styles.progress}>
            <ActivityIndicator accessibilityLabel={state.status === 'checking' ? 'Verifying cleanup scope' : 'Removing verified retired wallet'} color="#f3ba2f" size="large" />
            <Text style={styles.progressText}>{state.status === 'checking' ? 'Verifying exact cleanup scope...' : 'Removing and verifying retired primary...'}</Text>
          </View>
        ) : null}

        {deletionEligible ? (
          <View style={styles.warning}>
            <Text style={styles.warningTitle}>Irreversible boundary ready</Text>
            <Text style={styles.warningBody}>Candidate vault, active pointer, identities, and journals are outside this operation.</Text>
            <Pressable accessibilityRole="button" onPress={() => void executeVerifiedCleanup()} style={({ pressed }) => [styles.dangerButton, pressed && styles.pressed]}>
              <Text style={styles.dangerButtonText}>Execute verified retired-wallet cleanup</Text>
            </Pressable>
          </View>
        ) : null}

        {phaseAdvanceEligible ? (
          <View style={styles.recovery}>
            <Text style={styles.recoveryTitle}>Crash recovery verified</Text>
            <Text style={styles.recoveryBody}>The retired primary is already absent. This step writes only the durable primary-removed phase.</Text>
            <Pressable accessibilityRole="button" onPress={() => void advanceVerifiedRecoveryPhase()} style={({ pressed }) => [styles.recoveryButton, pressed && styles.pressed]}>
              <Text style={styles.recoveryButtonText}>Record primary-removed phase</Text>
            </Pressable>
          </View>
        ) : null}

        {finalizationEligible ? (
          <View style={styles.recovery}>
            <Text style={styles.recoveryTitle}>Finalization ready</Text>
            <Text style={styles.recoveryBody}>The retired primary is absent and primary-removed is durable. This step writes only the finalized phase.</Text>
            <View style={styles.nativeButton}>
              <Button
                accessibilityLabel="Finalize cleanup journal"
                color="#2f8062"
                onPress={() => void finalizeVerifiedCleanup()}
                title="Finalize cleanup journal"
              />
            </View>
          </View>
        ) : null}

        {state.status === 'complete' ? (
          <View accessibilityLiveRegion="polite" style={styles.success}>
              <Text style={styles.successTitle}>{state.operation === 'removal' ? 'Retired primary removed' : state.operation === 'finalization' ? 'Cleanup finalized' : 'Cleanup recovery advanced'}</Text>
              <Text style={styles.successBody}>{state.operation === 'removal' ? 'Empty storage read-back verified.' : state.operation === 'finalization' ? 'Durable finalized phase passed read-back verification.' : 'Durable primary-removed phase passed read-back verification.'} Recovery state: {state.audit.state}.</Text>
          </View>
        ) : null}

        {state.status === 'ready' && !deletionEligible && !phaseAdvanceEligible && !finalizationEligible ? <Text accessibilityRole="alert" style={styles.error}>Cleanup scope is not eligible. No wallet data was changed.</Text> : null}
        {state.status === 'error' ? <Text accessibilityRole="alert" style={styles.error}>Cleanup failed closed. Review the read-only audit before any retry.</Text> : null}

        <Pressable accessibilityRole="button" disabled={state.status === 'executing'} onPress={() => router.replace('/wallet')} style={({ pressed }) => [styles.returnButton, pressed && styles.pressed]}>
          <Text style={styles.returnButtonText}>Return to wallet</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  body: { color: '#9eb2a9', fontSize: 15, lineHeight: 23, marginTop: 12 },
  content: { flex: 1, justifyContent: 'center', padding: 24 },
  dangerButton: { alignItems: 'center', backgroundColor: '#9d4c48', borderRadius: 14, marginTop: 18, paddingVertical: 15 },
  dangerButtonText: { color: '#fff5f3', fontSize: 14, fontWeight: '900' },
  error: { color: '#ffaaa0', fontSize: 13, lineHeight: 20, marginTop: 22 },
  eyebrow: { color: '#f3ba2f', fontSize: 11, fontWeight: '900', letterSpacing: 1.6 },
  nativeButton: { borderRadius: 14, marginTop: 18, overflow: 'hidden' },
  pressed: { opacity: 0.76 },
  progress: { alignItems: 'center', marginTop: 28 },
  progressText: { color: '#9eb2a9', fontSize: 13, marginTop: 12 },
  recovery: { backgroundColor: '#0b1e18', borderColor: '#2f8062', borderRadius: 14, borderWidth: 1, marginTop: 24, padding: 18 },
  recoveryBody: { color: '#9eb2a9', fontSize: 13, lineHeight: 20, marginTop: 8 },
  recoveryButton: { alignItems: 'center', backgroundColor: '#7cf6bd', borderRadius: 14, marginTop: 18, paddingVertical: 15 },
  recoveryButtonText: { color: '#062015', fontSize: 14, fontWeight: '900' },
  recoveryTitle: { color: '#7cf6bd', fontSize: 16, fontWeight: '800' },
  returnButton: { alignItems: 'center', borderColor: '#52685f', borderRadius: 14, borderWidth: 1, marginTop: 22, paddingVertical: 14 },
  returnButtonText: { color: '#9eb2a9', fontSize: 14, fontWeight: '800' },
  safeArea: { backgroundColor: '#071310', flex: 1 },
  success: { backgroundColor: '#0b1e18', borderColor: '#2f8062', borderRadius: 14, borderWidth: 1, marginTop: 24, padding: 18 },
  successBody: { color: '#9eb2a9', fontSize: 13, lineHeight: 20, marginTop: 8 },
  successTitle: { color: '#7cf6bd', fontSize: 16, fontWeight: '800' },
  title: { color: '#f6fbf8', fontSize: 30, fontWeight: '800', marginTop: 12 },
  warning: { backgroundColor: '#25110f', borderColor: '#9d4c48', borderRadius: 14, borderWidth: 1, marginTop: 24, padding: 18 },
  warningBody: { color: '#d6aaa5', fontSize: 13, lineHeight: 20, marginTop: 8 },
  warningTitle: { color: '#ffaaa0', fontSize: 16, fontWeight: '800' },
});
