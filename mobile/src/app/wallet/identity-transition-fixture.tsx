import { Redirect, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { stagePhysicalIdentityTransitionFixture } from '@/security/physical-identity-transition-fixture';
import { useSensitiveScreenProtection } from '@/security/use-sensitive-screen-protection';

export default function IdentityTransitionFixtureScreen() {
  useSensitiveScreenProtection();
  const router = useRouter();
  const [pin, setPin] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!__DEV__) return <Redirect href="/wallet" />;

  async function stage() {
    setBusy(true);
    setError(null);
    try {
      await stagePhysicalIdentityTransitionFixture(pin);
      setPin('');
      setConfirmation('');
      setComplete(true);
    } catch {
      setPin('');
      setError('Test fixture failed closed. Existing primary wallet and identity were retained.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content}>
        <Text style={styles.protected}>DEBUG BUILD · SCREEN CAPTURE BLOCKED</Text>
        <Text accessibilityRole="header" style={styles.title}>Stage identity transition test</Text>
        <Text style={styles.body}>Creates a separate synthetic candidate and preserves the existing primary test wallet.</Text>
        {!complete ? (
          <>
            <Text style={styles.label}>Current six-digit PIN</Text>
            <TextInput keyboardType="number-pad" maxLength={6} onChangeText={(value) => setPin(value.replace(/\D/g, ''))} secureTextEntry style={styles.input} value={pin} />
            <Text style={styles.label}>Type CREATE TEST STATE</Text>
            <TextInput autoCapitalize="characters" maxLength={17} onChangeText={setConfirmation} style={styles.confirm} value={confirmation} />
            {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
            <Pressable accessibilityRole="button" disabled={busy || pin.length !== 6 || confirmation !== 'CREATE TEST STATE'} onPress={() => void stage()} style={[styles.primary, (busy || pin.length !== 6 || confirmation !== 'CREATE TEST STATE') && styles.disabled]}>
              {busy ? <ActivityIndicator color="#062015" /> : <Text style={styles.primaryText}>Create test state</Text>}
            </Pressable>
          </>
        ) : (
          <>
            <Text accessibilityLiveRegion="polite" style={styles.success}>Synthetic candidate active. Restart the app to continue the physical test.</Text>
            <Pressable accessibilityRole="button" onPress={() => router.replace('/wallet')} style={styles.primary}><Text style={styles.primaryText}>Return</Text></Pressable>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  body: { color: '#9eb2a9', fontSize: 15, lineHeight: 23, marginTop: 12 },
  confirm: { backgroundColor: '#0b1e18', borderColor: '#2f5145', borderRadius: 14, borderWidth: 1, color: '#f6fbf8', fontSize: 18, padding: 14 },
  content: { flex: 1, justifyContent: 'center', padding: 24 },
  disabled: { opacity: 0.4 },
  error: { color: '#ffaaa0', marginTop: 14 },
  input: { backgroundColor: '#0b1e18', borderColor: '#2f5145', borderRadius: 14, borderWidth: 1, color: '#f6fbf8', fontSize: 24, letterSpacing: 8, padding: 14 },
  label: { color: '#dff8eb', fontWeight: '800', marginBottom: 8, marginTop: 20 },
  primary: { alignItems: 'center', backgroundColor: '#7cf6bd', borderRadius: 14, justifyContent: 'center', marginTop: 20, minHeight: 52 },
  primaryText: { color: '#062015', fontWeight: '900' },
  protected: { color: '#f3ba2f', fontSize: 11, fontWeight: '900' },
  safeArea: { backgroundColor: '#071310', flex: 1 },
  success: { color: '#7cf6bd', fontWeight: '800', marginTop: 24 },
  title: { color: '#f6fbf8', fontSize: 29, fontWeight: '800', marginTop: 12 },
});
