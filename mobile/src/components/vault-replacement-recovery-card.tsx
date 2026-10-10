import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { getVaultReplacementRecoveryPresentation } from '@/security/vault-replacement-recovery-gate-core';
import { useVaultReplacementRecovery } from '@/security/vault-replacement-recovery-provider';

export function VaultReplacementRecoveryCard() {
  const router = useRouter();
  const state = useVaultReplacementRecovery();
  if (state.status === 'checking') {
    return (
      <View accessibilityLiveRegion="polite" style={styles.card}>
        <ActivityIndicator accessibilityLabel="Checking wallet replacement safety" color="#7cf6bd" />
        <Text style={styles.checking}>Checking wallet replacement safety...</Text>
      </View>
    );
  }

  const presentation = getVaultReplacementRecoveryPresentation(
    state.status === 'error' ? 'audit-error' : state.audit,
    state.status === 'ready' ? state.cleanupAudit : undefined,
  );
  if (!presentation) return null;

  return (
    <View
      accessibilityLiveRegion="polite"
      accessibilityRole={presentation.severity === 'critical' ? 'alert' : 'summary'}
      style={[styles.card, styles[presentation.severity]]}>
      <Text style={styles.eyebrow}>REPLACEMENT SAFETY</Text>
      <Text style={styles.title}>{presentation.title}</Text>
      <Text style={styles.body}>{presentation.body}</Text>
      {state.status === 'ready' && state.audit.state === 'cleanup-pending' &&
      !(state.cleanupAudit?.state === 'finalized' && state.cleanupAudit.action === 'complete') ? (
        <>
          <Pressable
            accessibilityHint="Opens PIN-authenticated retired wallet cleanup"
            accessibilityRole="button"
            onPress={() => router.push('/wallet/retired-wallet-cleanup')}
            style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
            <Text style={styles.buttonText}>Review secure cleanup</Text>
          </Pressable>
          {__DEV__ ? (
            <Pressable
              accessibilityHint="Runs a read-only cleanup safety audit"
              accessibilityRole="button"
              onPress={() => router.push('/wallet/retired-wallet-cleanup-audit')}
              style={({ pressed }) => [styles.auditButton, pressed && styles.pressed]}>
              <Text style={styles.auditButtonText}>Audit cleanup state</Text>
            </Pressable>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  body: { color: '#9eb2a9', fontSize: 13, lineHeight: 20, marginTop: 7 },
  auditButton: { alignItems: 'center', borderColor: '#52685f', borderRadius: 12, borderWidth: 1, marginTop: 10, paddingVertical: 12, width: '100%' },
  auditButtonText: { color: '#9eb2a9', fontSize: 13, fontWeight: '800' },
  button: { alignItems: 'center', borderColor: '#7cf6bd', borderRadius: 12, borderWidth: 1, marginTop: 14, paddingVertical: 12, width: '100%' },
  buttonText: { color: '#7cf6bd', fontSize: 13, fontWeight: '800' },
  card: {
    alignItems: 'flex-start',
    backgroundColor: '#0b1e18',
    borderColor: '#2f5145',
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 18,
    padding: 16,
  },
  checking: { color: '#9eb2a9', fontSize: 13, marginTop: 10 },
  critical: { borderColor: '#9d4c48' },
  eyebrow: { color: '#7cf6bd', fontSize: 11, fontWeight: '900', letterSpacing: 1.4 },
  information: { borderColor: '#2f5145' },
  pressed: { opacity: 0.76 },
  title: { color: '#dff8eb', fontSize: 15, fontWeight: '800', marginTop: 8 },
  warning: { borderColor: '#8a743f' },
});
