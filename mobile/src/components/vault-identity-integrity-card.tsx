import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { useVaultIdentityIntegrity } from '@/security/vault-identity-integrity-provider';

const messages = {
  'corrupt-vault-with-identity': {
    body: 'The independent recovery identity is preserved. Existing encrypted vault data was not changed.',
    severity: 'warning' as const,
    title: 'Recovery identity preserved',
  },
  'corrupt-vault-without-identity': {
    body: 'Recovery ownership cannot be authenticated from this device. Automatic identity creation is blocked.',
    severity: 'critical' as const,
    title: 'Recovery identity unavailable',
  },
  'identity-mismatch': {
    body: 'The active replacement wallet needs an authenticated identity transition. No identity metadata was changed automatically.',
    severity: 'critical' as const,
    title: 'Wallet identity mismatch',
  },
  'missing-identity': {
    body: 'This existing wallet needs a future PIN-authenticated identity migration. No automatic backfill was performed.',
    severity: 'warning' as const,
    title: 'Wallet identity migration required',
  },
  'orphaned-identity': {
    body: 'An identity record exists without an active vault. No automatic cleanup was performed.',
    severity: 'critical' as const,
    title: 'Orphaned wallet identity detected',
  },
  unsupported: {
    body: 'Secure storage is unavailable, so wallet identity integrity cannot be verified.',
    severity: 'critical' as const,
    title: 'Wallet identity check unavailable',
  },
};

export function VaultIdentityIntegrityCard() {
  const router = useRouter();
  const state = useVaultIdentityIntegrity();
  if (state.status === 'checking') {
    return (
      <View accessibilityLiveRegion="polite" style={styles.card}>
        <ActivityIndicator accessibilityLabel="Checking wallet identity integrity" color="#7cf6bd" />
        <Text style={styles.body}>Checking wallet identity integrity...</Text>
      </View>
    );
  }
  if (state.status === 'ready' && (state.audit.state === 'clean-empty' || state.audit.state === 'clean-bound')) {
    return null;
  }
  const message = state.status === 'error'
    ? messages.unsupported
    : messages[state.audit.state as keyof typeof messages];
  return (
    <View
      accessibilityLiveRegion="polite"
      accessibilityRole={message.severity === 'critical' ? 'alert' : 'summary'}
      style={[styles.card, styles[message.severity]]}>
      <Text style={styles.eyebrow}>WALLET IDENTITY</Text>
      <Text style={styles.title}>{message.title}</Text>
      <Text style={styles.body}>{message.body}</Text>
      {state.status === 'ready' && state.audit.state === 'missing-identity' ? (
        <Pressable
          accessibilityHint="Opens PIN-authenticated wallet identity migration"
          accessibilityRole="button"
          onPress={() => router.push('/wallet/identity-migration')}
          style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
          <Text style={styles.buttonText}>Secure wallet identity</Text>
        </Pressable>
      ) : null}
      {state.status === 'ready' && state.audit.state === 'identity-mismatch' ? (
        <Pressable
          accessibilityHint="Opens PIN-authenticated wallet identity transition"
          accessibilityRole="button"
          onPress={() => router.push('/wallet/identity-transition')}
          style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
          <Text style={styles.buttonText}>Review identity transition</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  body: { color: '#9eb2a9', fontSize: 13, lineHeight: 20, marginTop: 7 },
  button: { alignItems: 'center', borderColor: '#7cf6bd', borderRadius: 12, borderWidth: 1, marginTop: 14, paddingVertical: 12 },
  buttonText: { color: '#7cf6bd', fontSize: 13, fontWeight: '800' },
  card: { backgroundColor: '#0b1e18', borderColor: '#2f5145', borderRadius: 16, borderWidth: 1, marginTop: 18, padding: 16 },
  critical: { borderColor: '#9d4c48' },
  eyebrow: { color: '#7cf6bd', fontSize: 11, fontWeight: '900', letterSpacing: 1.4 },
  title: { color: '#dff8eb', fontSize: 15, fontWeight: '800', marginTop: 8 },
  pressed: { opacity: 0.76 },
  warning: { borderColor: '#8a743f' },
});
