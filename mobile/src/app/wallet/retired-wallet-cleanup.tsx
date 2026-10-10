import { Redirect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getPinRetryGate } from '@/security/pin-retry-store';
import { validatePin } from '@/security/pin-policy';
import { RETIRED_PRIMARY_CLEANUP_CONFIRMATION } from '@/security/retired-primary-cleanup-authorization';
import { createRetiredPrimaryCleanupController } from '@/security/retired-primary-cleanup-controller';
import { recordAuthorizedRetiredPrimaryCleanupIntentOnly } from '@/security/retired-primary-cleanup-executor';
import { planRetiredPrimaryCleanup } from '@/security/retired-primary-cleanup-policy';
import { readStoredRetiredPrimaryCleanupSnapshot } from '@/security/retired-primary-cleanup-snapshot';
import { useSensitiveScreenProtection } from '@/security/use-sensitive-screen-protection';
import { InvalidVaultPinError, PinRetryBlockedError } from '@/security/vault-unlock-gate';

type ScreenStage = 'checking' | 'awaiting-pin' | 'awaiting-confirmation' | 'complete' | 'blocked';

function formatCountdown(milliseconds: number): string {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1_000));
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return minutes > 0 ? `${minutes}:${remainder.toString().padStart(2, '0')}` : `${remainder}s`;
}

export default function RetiredWalletCleanupScreen() {
  useSensitiveScreenProtection();
  const router = useRouter();
  const [controller] = useState(() => createRetiredPrimaryCleanupController());
  const mounted = useRef(true);
  const [stage, setStage] = useState<ScreenStage>('checking');
  const [pin, setPin] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blockedUntil, setBlockedUntil] = useState(0);
  const [now, setNow] = useState(0);

  const refreshGate = useCallback(async () => {
    const checkedAt = Date.now();
    const gate = await getPinRetryGate(checkedAt);
    if (mounted.current) {
      setNow(checkedAt);
      setBlockedUntil(gate.allowed ? 0 : gate.blockedUntil);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void (async () => {
      try {
        const snapshot = await readStoredRetiredPrimaryCleanupSnapshot();
        const state = controller.begin(planRetiredPrimaryCleanup(snapshot));
        if (!mounted.current) return;
        if (state.stage !== 'awaiting-pin') {
          setStage('blocked');
          return;
        }
        await refreshGate();
        if (mounted.current) setStage('awaiting-pin');
      } catch {
        if (mounted.current) setStage('blocked');
      }
    })();
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active') {
        controller.reset();
        if (mounted.current) router.replace('/wallet');
      }
    });
    return () => {
      mounted.current = false;
      controller.reset();
      subscription.remove();
    };
  }, [controller, refreshGate, router]);

  useEffect(() => {
    if (blockedUntil <= Date.now()) return;
    const timer = setInterval(() => {
      const nextNow = Date.now();
      setNow(nextNow);
      if (nextNow >= blockedUntil) setBlockedUntil(0);
    }, 250);
    return () => clearInterval(timer);
  }, [blockedUntil]);

  const retryAfterMs = Math.max(0, blockedUntil - now);
  const blocked = retryAfterMs > 0;

  async function verifyPin() {
    setError(null);
    const validation = validatePin(pin);
    if (!validation.ok) {
      setError(validation.message);
      return;
    }
    setBusy(true);
    try {
      await controller.authenticatePin(pin, Date.now());
      if (mounted.current) {
        setBlockedUntil(0);
        setStage('awaiting-confirmation');
      }
    } catch (caught) {
      if (!mounted.current) return;
      if (caught instanceof PinRetryBlockedError) {
        const checkedAt = Date.now();
        setNow(checkedAt);
        setBlockedUntil(checkedAt + caught.retryAfterMs);
        setError('Too many attempts. PIN entry is temporarily locked.');
      } else if (caught instanceof InvalidVaultPinError) {
        setError('Incorrect PIN. Try again.');
        await refreshGate();
      } else {
        setError('PIN verification failed closed. Retired wallet data was not changed.');
      }
    } finally {
      if (mounted.current) {
        setPin('');
        setBusy(false);
      }
    }
  }

  async function recordCleanupIntent() {
    setError(null);
    const executionTime = Date.now();
    const authorization = controller.confirm(confirmation, executionTime);
    if (authorization.stage !== 'authorized') {
      setConfirmation('');
      setError(authorization.stage === 'idle'
        ? 'Cleanup authorization expired. Return and authenticate again.'
        : `Type ${RETIRED_PRIMARY_CLEANUP_CONFIRMATION} exactly to continue.`);
      return;
    }
    setBusy(true);
    try {
      const result = await recordAuthorizedRetiredPrimaryCleanupIntentOnly(authorization, executionTime);
      if (result.action !== 'write-intent') throw new Error('unexpected cleanup step');
      controller.reset();
      if (mounted.current) setStage('complete');
    } catch {
      controller.reset();
      if (mounted.current) {
        setConfirmation('');
        setStage('blocked');
        setError('Cleanup intent failed closed. Retired wallet data was retained.');
      }
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  if (stage === 'blocked' && !error) return <Redirect href="/wallet" />;

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.keyboard}>
        <View style={styles.content}>
          <Text style={styles.protected}>SCREEN CAPTURE BLOCKED</Text>
          <Text accessibilityRole="header" style={styles.title}>Review retired wallet cleanup</Text>
          <Text style={styles.body}>Confirm ownership of the active wallet. This screen records durable cleanup intent only; it does not remove the retired encrypted wallet.</Text>

          {stage === 'checking' ? <ActivityIndicator accessibilityLabel="Checking retired wallet cleanup eligibility" color="#7cf6bd" size="large" style={styles.loader} /> : null}

          {stage === 'awaiting-pin' ? (
            <View style={styles.form}>
              <Text style={styles.label}>Active wallet PIN</Text>
              <TextInput accessibilityLabel="Active wallet six-digit PIN" autoComplete="off" editable={!busy && !blocked} keyboardType="number-pad" maxLength={6} onChangeText={(value) => setPin(value.replace(/\D/g, ''))} secureTextEntry style={styles.pinInput} value={pin} />
              {blocked ? (
                <View accessibilityLiveRegion="polite" accessibilityRole="alert" style={styles.warning}>
                  <Text style={styles.warningTitle}>Try again in {formatCountdown(retryAfterMs)}</Text>
                  <Text style={styles.warningBody}>The cooldown remains active if the app is restarted.</Text>
                </View>
              ) : null}
              <Pressable accessibilityRole="button" disabled={busy || blocked || pin.length !== 6} onPress={() => void verifyPin()} style={({ pressed }) => [styles.primary, (busy || blocked || pin.length !== 6) && styles.disabled, pressed && styles.pressed]}>
                {busy ? <ActivityIndicator color="#062015" /> : <Text style={styles.primaryText}>Verify PIN</Text>}
              </Pressable>
            </View>
          ) : null}

          {stage === 'awaiting-confirmation' ? (
            <View style={styles.form}>
              <Text style={styles.label}>Type {RETIRED_PRIMARY_CLEANUP_CONFIRMATION} to confirm</Text>
              <TextInput accessibilityLabel={`Type ${RETIRED_PRIMARY_CLEANUP_CONFIRMATION} to confirm cleanup intent`} autoCapitalize="characters" autoComplete="off" editable={!busy} maxLength={RETIRED_PRIMARY_CLEANUP_CONFIRMATION.length} onChangeText={setConfirmation} placeholder={RETIRED_PRIMARY_CLEANUP_CONFIRMATION} placeholderTextColor="#52685f" style={styles.confirmInput} value={confirmation} />
              <Pressable accessibilityRole="button" disabled={busy || confirmation.length !== RETIRED_PRIMARY_CLEANUP_CONFIRMATION.length} onPress={() => void recordCleanupIntent()} style={({ pressed }) => [styles.primary, (busy || confirmation.length !== RETIRED_PRIMARY_CLEANUP_CONFIRMATION.length) && styles.disabled, pressed && styles.pressed]}>
                {busy ? <ActivityIndicator color="#062015" /> : <Text style={styles.primaryText}>Secure cleanup intent</Text>}
              </Pressable>
            </View>
          ) : null}

          {stage === 'complete' ? (
            <View accessibilityLiveRegion="polite" style={styles.successBox}>
              <Text style={styles.successTitle}>Cleanup intent secured</Text>
              <Text style={styles.successBody}>Durable intent passed read-back verification. A separate recovery step is required before retired wallet removal.</Text>
              <Pressable accessibilityRole="button" onPress={() => router.replace('/wallet')} style={styles.primary}><Text style={styles.primaryText}>Return to wallet</Text></Pressable>
            </View>
          ) : null}

          {error ? <Text accessibilityLiveRegion="assertive" accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
          <Text style={styles.footnote}>Your PIN is never stored. This screen cannot delete encrypted wallet data, identities, pointers, or journals.</Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  body: { color: '#9eb2a9', fontSize: 15, lineHeight: 23, marginTop: 12 },
  confirmInput: { backgroundColor: '#0b1e18', borderColor: '#2f5145', borderRadius: 14, borderWidth: 1, color: '#f6fbf8', fontSize: 18, fontWeight: '800', letterSpacing: 2, paddingHorizontal: 18, paddingVertical: 14 },
  content: { flex: 1, justifyContent: 'center', padding: 24 },
  disabled: { opacity: 0.4 },
  error: { color: '#ffaaa0', fontSize: 13, lineHeight: 19, marginTop: 14 },
  footnote: { color: '#71877e', fontSize: 11, lineHeight: 17, marginTop: 22 },
  form: { marginTop: 22 },
  keyboard: { flex: 1 },
  label: { color: '#dff8eb', fontSize: 13, fontWeight: '800', marginBottom: 8 },
  loader: { marginTop: 28 },
  pinInput: { backgroundColor: '#0b1e18', borderColor: '#2f5145', borderRadius: 14, borderWidth: 1, color: '#f6fbf8', fontSize: 24, letterSpacing: 8, paddingHorizontal: 18, paddingVertical: 14 },
  pressed: { opacity: 0.78 },
  primary: { alignItems: 'center', backgroundColor: '#7cf6bd', borderRadius: 14, justifyContent: 'center', marginTop: 20, minHeight: 52 },
  primaryText: { color: '#062015', fontSize: 15, fontWeight: '900' },
  protected: { color: '#f3ba2f', fontSize: 11, fontWeight: '900', letterSpacing: 1.6 },
  safeArea: { backgroundColor: '#071310', flex: 1 },
  successBody: { color: '#9eb2a9', fontSize: 13, lineHeight: 20, marginTop: 6 },
  successBox: { backgroundColor: '#0b1e18', borderColor: '#2f5145', borderRadius: 14, borderWidth: 1, marginTop: 22, padding: 16 },
  successTitle: { color: '#7cf6bd', fontSize: 15, fontWeight: '800' },
  title: { color: '#f6fbf8', fontSize: 30, fontWeight: '800', marginTop: 12 },
  warning: { backgroundColor: '#251d0d', borderColor: '#745b22', borderRadius: 14, borderWidth: 1, marginTop: 16, padding: 14 },
  warningBody: { color: '#cdbd91', fontSize: 12, lineHeight: 18, marginTop: 4 },
  warningTitle: { color: '#ffe39a', fontSize: 14, fontWeight: '800' },
});
