import { Redirect, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { RetiredPrimaryCleanupPreDeletionAudit } from '@/security/retired-primary-cleanup-pre-deletion-audit-core';
import { auditStoredRetiredPrimaryCleanupPreDeletion } from '@/security/retired-primary-cleanup-pre-deletion-audit';
import { useSensitiveScreenProtection } from '@/security/use-sensitive-screen-protection';

type AuditScreenState =
  | { status: 'checking' }
  | { audit: RetiredPrimaryCleanupPreDeletionAudit; status: 'ready' }
  | { status: 'error' };

export default function RetiredWalletCleanupAuditScreen() {
  useSensitiveScreenProtection();
  const router = useRouter();
  const [state, setState] = useState<AuditScreenState>({ status: 'checking' });

  useEffect(() => {
    let active = true;
    void auditStoredRetiredPrimaryCleanupPreDeletion()
      .then((audit) => {
        if (active) setState({ audit, status: 'ready' });
      })
      .catch(() => {
        if (active) setState({ status: 'error' });
      });
    return () => { active = false; };
  }, []);

  if (!__DEV__) return <Redirect href="/wallet" />;

  const safe = state.status === 'ready' && state.audit.action !== 'fail-closed';
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content}>
        <Text style={styles.eyebrow}>DEBUG · READ ONLY</Text>
        <Text accessibilityRole="header" style={styles.title}>Cleanup safety audit</Text>
        <Text style={styles.body}>This diagnostic reads public security metadata and encrypted-slot status. It cannot write or delete wallet data.</Text>

        {state.status === 'checking' ? (
          <ActivityIndicator accessibilityLabel="Running read-only cleanup audit" color="#7cf6bd" size="large" style={styles.loader} />
        ) : state.status === 'error' ? (
          <View accessibilityRole="alert" style={[styles.result, styles.failed]}>
            <Text style={styles.resultTitle}>Audit unavailable</Text>
            <Text style={styles.resultBody}>Secure state could not be read. No wallet data was changed.</Text>
          </View>
        ) : (
          <View accessibilityLiveRegion="polite" accessibilityRole={safe ? 'summary' : 'alert'} style={[styles.result, safe ? styles.safe : styles.failed]}>
            <Text style={styles.resultTitle}>{safe ? 'Audit completed' : 'Audit failed closed'}</Text>
            <Text style={styles.label}>State</Text>
            <Text style={styles.value}>{state.audit.state}</Text>
            <Text style={styles.label}>Action</Text>
            <Text style={styles.value}>{state.audit.action}</Text>
          </View>
        )}

        <Pressable accessibilityRole="button" onPress={() => router.replace('/wallet')} style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
          <Text style={styles.buttonText}>Return to wallet</Text>
        </Pressable>
        {state.status === 'ready' && (
          (state.audit.state === 'intent-primary-present' && state.audit.action === 'resume-cleanup') ||
          (state.audit.state === 'intent-primary-absent' && state.audit.action === 'advance-journal') ||
          (state.audit.state === 'primary-removed' && state.audit.action === 'advance-journal')
        ) ? (
          <Pressable accessibilityRole="button" onPress={() => router.push('/wallet/retired-wallet-cleanup-execution')} style={({ pressed }) => [styles.dangerButton, pressed && styles.pressed]}>
            <Text style={styles.dangerButtonText}>
              {state.audit.state === 'intent-primary-present'
                ? 'Open verified cleanup execution'
                : state.audit.state === 'intent-primary-absent'
                  ? 'Open cleanup recovery advancement'
                  : 'Open cleanup finalization'}
            </Text>
          </Pressable>
        ) : null}
        <Text style={styles.footnote}>No addresses, encrypted payloads, secrets, PIN values, or recovery data are displayed.</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  body: { color: '#9eb2a9', fontSize: 15, lineHeight: 23, marginTop: 12 },
  button: { alignItems: 'center', borderColor: '#7cf6bd', borderRadius: 14, borderWidth: 1, marginTop: 22, paddingVertical: 14 },
  buttonText: { color: '#7cf6bd', fontSize: 14, fontWeight: '800' },
  content: { flex: 1, justifyContent: 'center', padding: 24 },
  dangerButton: { alignItems: 'center', borderColor: '#d56b62', borderRadius: 14, borderWidth: 1, marginTop: 12, paddingVertical: 14 },
  dangerButtonText: { color: '#ffaaa0', fontSize: 14, fontWeight: '800' },
  eyebrow: { color: '#f3ba2f', fontSize: 11, fontWeight: '900', letterSpacing: 1.6 },
  failed: { borderColor: '#9d4c48' },
  footnote: { color: '#71877e', fontSize: 11, lineHeight: 17, marginTop: 20 },
  label: { color: '#71877e', fontSize: 11, fontWeight: '800', letterSpacing: 1.2, marginTop: 16, textTransform: 'uppercase' },
  loader: { marginTop: 28 },
  pressed: { opacity: 0.76 },
  result: { backgroundColor: '#0b1e18', borderRadius: 14, borderWidth: 1, marginTop: 24, padding: 18 },
  resultBody: { color: '#9eb2a9', fontSize: 13, lineHeight: 20, marginTop: 8 },
  resultTitle: { color: '#dff8eb', fontSize: 16, fontWeight: '800' },
  safe: { borderColor: '#2f8062' },
  safeArea: { backgroundColor: '#071310', flex: 1 },
  title: { color: '#f6fbf8', fontSize: 30, fontWeight: '800', marginTop: 12 },
  value: { color: '#7cf6bd', fontSize: 16, fontWeight: '800', marginTop: 5 },
});
