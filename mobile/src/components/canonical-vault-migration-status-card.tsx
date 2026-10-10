import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { getCanonicalVaultMigrationStatusCardModel } from '@/security/canonical-vault-migration-status-card-core';
import { useCanonicalVaultMigrationStatus } from '@/security/canonical-vault-migration-status-provider';

export function CanonicalVaultMigrationStatusCard() {
  const router = useRouter();
  const model = getCanonicalVaultMigrationStatusCardModel(useCanonicalVaultMigrationStatus());
  if (model.state === 'checking') {
    return (
      <View accessibilityLiveRegion="polite" style={styles.card}>
        <ActivityIndicator accessibilityLabel={model.accessibilityLabel} color="#7cf6bd" />
        <Text style={styles.checking}>Checking wallet storage safety...</Text>
      </View>
    );
  }

  return (
    <View
      accessibilityLiveRegion="polite"
      accessibilityRole={model.blocksWallet ? 'alert' : 'summary'}
      style={[styles.card, styles[model.severity]]}>
      <Text style={styles.eyebrow}>WALLET STORAGE SAFETY</Text>
      <Text style={styles.title}>{model.title}</Text>
      <Text style={styles.body}>{model.body}</Text>
      {model.requiresUserAction ? (
        <Text accessibilityRole="text" style={styles.actionNote}>Review required before any change.</Text>
      ) : null}
      {model.canReviewOptimization ? (
        <Pressable
          accessibilityHint="Opens the protected wallet storage optimization review"
          accessibilityRole="button"
          onPress={() => router.push('/wallet/canonical-migration-review')}
          style={({ pressed }) => [styles.button, pressed && styles.pressed]}
        >
          <Text style={styles.buttonText}>Review storage optimization</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  actionNote: { color: '#f3d98c', fontSize: 12, fontWeight: '800', marginTop: 12 },
  body: { color: '#9eb2a9', fontSize: 13, lineHeight: 20, marginTop: 7 },
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
  success: { borderColor: '#2f8062' },
  title: { color: '#dff8eb', fontSize: 15, fontWeight: '800', marginTop: 8 },
  warning: { borderColor: '#8a743f' },
});
