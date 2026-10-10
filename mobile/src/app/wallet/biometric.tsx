import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useSensitiveScreenProtection } from '@/security/use-sensitive-screen-protection';
import {
  BiometricWorkflowError,
  cleanupStoredOrphanedBiometricKeys,
  disableStoredVaultBiometrics,
  enableStoredVaultBiometrics,
  reenrollStoredVaultBiometrics,
} from '@/security/vault-biometric-workflow';
import { auditStoredBiometricIntegrity } from '@/security/biometric-integrity';
import { readActiveVaultV3OrNull } from '@/security/vault-active-resolver';

export default function BiometricConsentScreen() {
  useSensitiveScreenProtection();
  const router = useRouter();
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [complete, setComplete] = useState<'enabled' | 'disabled' | 'reenrolled' | 'cleaned' | null>(null);
  const [orphanCount, setOrphanCount] = useState(0);

  useEffect(() => {
    let active = true;
    void Promise.all([readActiveVaultV3OrNull(), auditStoredBiometricIntegrity()])
      .then(([resolution, audit]) => {
        if (active) {
          setConfigured(!!resolution?.vault.biometric);
          setOrphanCount(audit.orphanedKeyIds.length);
        }
      })
      .catch(() => {
        if (active) setError('Biometric configuration could not be verified.');
      });
    return () => { active = false; };
  }, []);

  async function enable() {
    setBusy(true);
    setError(null);
    try {
      await enableStoredVaultBiometrics(pin);
      setPin('');
      setComplete('enabled');
    } catch (caught) {
      setPin('');
      if (caught instanceof BiometricWorkflowError) {
        setError(
          caught.outcome === 'busy'
            ? 'A biometric prompt is already active.'
            : caught.outcome === 'session-invalidated'
              ? 'Biometric setup stopped when the app left the foreground.'
              : caught.outcome === 'vault-not-primary'
                ? __DEV__
                  ? 'Debug Gate A: the active synthetic vault is still a replacement candidate. Biometric setup was safely blocked; no key was created.'
                  : 'Biometric setup is temporarily unavailable while wallet replacement state is being verified.'
              : caught.outcome === 'locked-out' || caught.outcome === 'cooldown'
                ? 'Biometrics are temporarily locked. Continue using your PIN and try later.'
              : 'Biometric setup did not complete. Continue using your PIN.',
        );
      } else {
        setError('PIN verification or secure biometric setup failed. Nothing was enabled.');
      }
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setError(null);
    try {
      await disableStoredVaultBiometrics(pin);
      setPin('');
      setComplete('disabled');
    } catch {
      setPin('');
      setError('PIN verification failed. Biometric unlock remains enabled.');
    } finally {
      setBusy(false);
    }
  }

  async function reenroll() {
    setBusy(true);
    setError(null);
    try {
      await reenrollStoredVaultBiometrics(pin);
      setPin('');
      setComplete('reenrolled');
    } catch (caught) {
      setPin('');
      setError(
        caught instanceof BiometricWorkflowError
          ? caught.outcome === 'busy'
            ? 'A biometric prompt is already active.'
            : caught.outcome === 'session-invalidated'
              ? 'Biometric re-enrollment stopped when the app left the foreground.'
            : caught.outcome === 'locked-out' || caught.outcome === 'cooldown'
              ? 'Biometrics are temporarily locked. PIN unlock remains available.'
              : 'Biometric re-enrollment did not complete. PIN unlock remains available.'
          : 'PIN verification or biometric re-enrollment failed. Existing settings were retained.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function cleanupOrphans() {
    setBusy(true);
    setError(null);
    try {
      await cleanupStoredOrphanedBiometricKeys(pin);
      setPin('');
      setOrphanCount(0);
      setComplete('cleaned');
    } catch {
      setPin('');
      setError('PIN verification or orphan cleanup failed. Remaining keys were retained for a safe retry.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content}>
        <Text style={styles.protected}>SCREEN CAPTURE BLOCKED</Text>
        <Text accessibilityRole="header" style={styles.title}>
          {configured ? 'Manage biometric unlock' : 'Enable biometric unlock'}
        </Text>
        <Text style={styles.body}>
          {configured
            ? 'Confirm your PIN to remove biometric access. PIN unlock will remain available.'
            : 'Confirm your PIN, then approve the system biometric prompt. Your PIN remains the recovery fallback.'}
        </Text>
        {!complete ? (
          <>
            <Text style={styles.label}>Confirm PIN</Text>
            <TextInput
              accessibilityLabel={configured ? 'Confirm PIN to disable biometrics' : 'Confirm PIN for biometric opt-in'}
              editable={!busy}
              keyboardType="number-pad"
              maxLength={6}
              onChangeText={(value) => setPin(value.replace(/\D/g, ''))}
              secureTextEntry
              style={styles.input}
              value={pin}
            />
            {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
            <Pressable
              accessibilityRole="button"
              disabled={configured === null || busy || pin.length !== 6}
              onPress={() => void (configured ? reenroll() : enable())}
              style={[styles.primary, (configured === null || busy || pin.length !== 6) && styles.disabled]}>
              {busy ? (
                <ActivityIndicator color="#062015" />
              ) : (
                <Text style={styles.primaryText}>
                  {configured ? 'Verify PIN and re-enroll' : 'Verify PIN and continue'}
                </Text>
              )}
            </Pressable>
            {configured ? (
              <Pressable
                accessibilityRole="button"
                disabled={busy || pin.length !== 6}
                onPress={() => void disable()}
                style={[styles.danger, (busy || pin.length !== 6) && styles.disabled]}>
                <Text style={styles.dangerText}>Verify PIN and disable</Text>
              </Pressable>
            ) : null}
            {orphanCount > 0 ? (
              <Pressable
                accessibilityRole="button"
                disabled={busy || pin.length !== 6}
                onPress={() => void cleanupOrphans()}
                style={[styles.danger, (busy || pin.length !== 6) && styles.disabled]}>
                <Text style={styles.dangerText}>
                  Verify PIN and clean up {orphanCount} orphaned {orphanCount === 1 ? 'key' : 'keys'}
                </Text>
              </Pressable>
            ) : null}
          </>
        ) : (
          <>
            <Text accessibilityLiveRegion="polite" style={styles.success}>
              {complete === 'enabled'
                ? 'Biometric unlock enabled.'
                : complete === 'reenrolled'
                  ? 'Biometric unlock re-enrolled.'
                  : complete === 'cleaned'
                    ? 'Orphaned biometric keys removed.'
                  : 'Biometric unlock disabled.'}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.replace('/wallet')}
              style={styles.primary}>
              <Text style={styles.primaryText}>Done</Text>
            </Pressable>
          </>
        )}
        <Text style={styles.footnote}>
          AurionXI never stores your PIN or plaintext vault key in biometric storage.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#071310' },
  content: { flex: 1, justifyContent: 'center', padding: 24 },
  protected: { color: '#f3ba2f', fontSize: 11, fontWeight: '900', letterSpacing: 1.6 },
  title: { color: '#f6fbf8', fontSize: 30, fontWeight: '800', marginTop: 12 },
  body: { color: '#9eb2a9', fontSize: 15, lineHeight: 23, marginTop: 12 },
  label: { color: '#dff8eb', fontSize: 13, fontWeight: '800', marginBottom: 8, marginTop: 24 },
  input: { backgroundColor: '#0b1e18', borderColor: '#2f5145', borderRadius: 14, borderWidth: 1, color: '#f6fbf8', fontSize: 24, letterSpacing: 8, padding: 14 },
  primary: { alignItems: 'center', backgroundColor: '#7cf6bd', borderRadius: 14, justifyContent: 'center', marginTop: 20, minHeight: 52 },
  primaryText: { color: '#062015', fontSize: 15, fontWeight: '900' },
  disabled: { opacity: 0.4 },
  danger: { alignItems: 'center', borderColor: '#ff8d82', borderRadius: 14, borderWidth: 1, justifyContent: 'center', marginTop: 12, minHeight: 52 },
  dangerText: { color: '#ffaaa0', fontSize: 15, fontWeight: '900' },
  error: { color: '#ffaaa0', fontSize: 13, lineHeight: 19, marginTop: 14 },
  success: { color: '#7cf6bd', fontSize: 16, fontWeight: '800', marginTop: 24 },
  footnote: { color: '#71877e', fontSize: 11, lineHeight: 17, marginTop: 22 },
});
