import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { executeTestnetNamespaceMigrationWithBiometricReenrollment } from '@/security/testnet-vault-namespace-migration-executor';

export default function TestnetNamespaceMigrationScreen() {
  const router = useRouter();
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function migrate() {
    if (!/^\d{6}$/.test(pin) || busy) return;
    setBusy(true);
    setError(null);
    try {
      await executeTestnetNamespaceMigrationWithBiometricReenrollment(pin);
      setPin('');
      router.replace('/wallet');
    } catch {
      setError('Migration was not completed. Existing wallet data remains unchanged. Verify your PIN and complete the fingerprint prompt.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content}>
        <Text style={styles.eyebrow}>SECURE TESTNET STORAGE</Text>
        <Text style={styles.title}>Move this wallet to its own Testnet namespace</Text>
        <Text style={styles.body}>Your existing encrypted vault and wallet identity will be copied and verified. Legacy records stay on this device. A new biometric key will be created only after your PIN and system fingerprint approval. No Mainnet wallet is created.</Text>
        <TextInput
          accessibilityLabel="Current wallet PIN"
          autoFocus
          keyboardType="number-pad"
          maxLength={6}
          onChangeText={setPin}
          secureTextEntry
          style={styles.input}
          value={pin}
        />
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        <Pressable accessibilityRole="button" disabled={busy || !/^\d{6}$/.test(pin)} onPress={() => void migrate()} style={({ pressed }) => [styles.primary, (busy || !/^\d{6}$/.test(pin)) && styles.disabled, pressed && styles.pressed]}>
          {busy ? <ActivityIndicator color="#071310" /> : <Text style={styles.primaryText}>Verify PIN and migrate</Text>}
        </Pressable>
        <Pressable accessibilityRole="button" disabled={busy} onPress={() => router.back()} style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}>
          <Text style={styles.secondaryText}>Return to wallet</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#071310' },
  content: { flex: 1, justifyContent: 'center', padding: 24 },
  eyebrow: { color: '#a891f6', fontSize: 12, fontWeight: '800', letterSpacing: 1.5 },
  title: { color: '#f6fbf8', fontSize: 29, fontWeight: '800', lineHeight: 36, marginTop: 12 },
  body: { color: '#9eb2a9', fontSize: 15, lineHeight: 23, marginTop: 12 },
  input: { backgroundColor: '#0b1e18', borderColor: '#4a6f60', borderRadius: 14, borderWidth: 1, color: '#f6fbf8', fontSize: 19, letterSpacing: 5, marginTop: 24, paddingHorizontal: 16, paddingVertical: 15, textAlign: 'center' },
  primary: { alignItems: 'center', backgroundColor: '#7cf6bd', borderRadius: 14, marginTop: 16, minHeight: 52, justifyContent: 'center', paddingVertical: 15 },
  primaryText: { color: '#071310', fontSize: 15, fontWeight: '800' },
  secondary: { alignItems: 'center', borderColor: '#7cf6bd', borderRadius: 14, borderWidth: 1, marginTop: 12, minHeight: 52, justifyContent: 'center', paddingVertical: 15 },
  secondaryText: { color: '#7cf6bd', fontSize: 15, fontWeight: '800' },
  disabled: { opacity: 0.45 }, pressed: { opacity: 0.75 }, error: { color: '#ffaaa0', fontSize: 13, lineHeight: 20, marginTop: 12 },
});
