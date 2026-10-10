import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Image, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useMainnetSessionLock } from '@/security/mainnet-session-lock-provider';
import { unlockMainnetVaultWithBiometrics, unlockMainnetVaultWithPin } from '@/security/mainnet-vault-biometric-workflow';
import { zeroizeBytes } from '@/security/secret-memory';
import { cancelActiveBiometricAuthentication } from '@/security/biometric-authentication';
import { MAINNET_UNLOCK_ATTEMPT_TIMEOUT_MS, MainnetUnlockAttemptGate, MainnetUnlockAutoPromptGate } from '@/security/mainnet-unlock-attempt';

export default function MainnetUnlockScreen() {
  const router = useRouter();
  const { unlock } = useMainnetSessionLock();
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string>();
  const gate = useRef(new MainnetUnlockAttemptGate());
  const autoPrompt = useRef(new MainnetUnlockAutoPromptGate());
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const [screenFocused, setScreenFocused] = useState(false);
  const focused = useRef(false);
  const mounted = useRef(true);
  const appState = useRef(AppState.currentState);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const cancelAttempt = useCallback(() => {
    if (!gate.current.retire()) return;
    clearTimeout(timer.current);
    void cancelActiveBiometricAuthentication();
    if (mounted.current) {
      setBusy(false); setPin('');
      setNotice('Unlock was interrupted. Enter your PIN or tap Use fingerprint after returning.');
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    const subscription = AppState.addEventListener('change', (next) => {
      appState.current = next;
      setForeground(next === 'active');
      if (next === 'background') cancelAttempt();
    });
    return () => { mounted.current = false; cancelAttempt(); subscription.remove(); clearTimeout(timer.current); };
  }, [cancelAttempt]);
  useFocusEffect(useCallback(() => {
    focused.current = true;
    setScreenFocused(true);
    return () => { focused.current = false; setScreenFocused(false); cancelAttempt(); };
  }, [cancelAttempt]));

  async function authenticate(method: 'pin' | 'biometric') {
    const attempt = gate.current.begin(focused.current && appState.current === 'active');
    if (!attempt) return;
    autoPrompt.current.suppress();
    Keyboard.dismiss();
    const isCurrent = () => mounted.current && focused.current && appState.current !== 'background' && gate.current.isCurrent(attempt);
    let payload: Uint8Array | undefined;
    setBusy(true);
    setNotice(undefined);
    timer.current = setTimeout(() => {
      if (!gate.current.retire(attempt)) return;
      void cancelActiveBiometricAuthentication();
      if (mounted.current) {
        setBusy(false); setPin('');
        setNotice('Unlock timed out. Your wallet remains locked. Enter your PIN or retry fingerprint.');
      }
    }, MAINNET_UNLOCK_ATTEMPT_TIMEOUT_MS);
    try {
      payload = method === 'pin'
        ? await unlockMainnetVaultWithPin(pin)
        : await unlockMainnetVaultWithBiometrics(isCurrent);
      if (!isCurrent()) return;
      if (payload.length === 0) throw new Error();
      // Retire before navigation; blur cleanup must not cancel a later screen.
      gate.current.retire(attempt);
      clearTimeout(timer.current);
      setPin(''); setBusy(false);
      unlock();
      router.replace('/wallet/mainnet-readonly' as never);
    } catch {
      if (isCurrent()) setNotice(method === 'pin'
        ? 'Incorrect PIN. Try again.'
        : 'Fingerprint unlock did not complete. Enter your PIN or retry after returning to the wallet.');
    } finally {
      zeroizeBytes(payload);
      // An old completion must not clear a newer PIN/biometric attempt.
      if (gate.current.retire(attempt)) {
        clearTimeout(timer.current);
        if (mounted.current) { setPin(''); setBusy(false); }
      }
    }
  }

  useEffect(() => {
    // Unlike the original mount effect, this cannot run in a backgrounded or
    // unfocused screen. The workflow also waits for Android RESUMED/unsaved state.
    if (!autoPrompt.current.offer(foreground && screenFocused, busy)) return;
    void authenticate('biometric');
    // Once per unlock-screen presentation; explicit retry remains available.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [foreground, screenFocused, busy]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView style={styles.keyboardArea} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        <View style={styles.brandBlock}>
          <Image accessibilityLabel="AurionXI Wallet logo" source={require('../../assets/wallet-logo.webp')} style={styles.logo} />
          <Text style={styles.brand}>AurionXI Wallet</Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>Enter PIN</Text>
          <TextInput
            accessibilityLabel="Wallet six-digit PIN"
            autoComplete="off"
            editable={!busy}
            keyboardType="number-pad"
            maxLength={6}
            onChangeText={(value) => setPin(value.replace(/\D/g, ''))}
            secureTextEntry
            style={styles.input}
            value={pin}
          />
          {notice ? <Text accessibilityRole="alert" style={styles.notice}>{notice}</Text> : null}

          <Pressable
            accessibilityLabel="Unlock wallet with PIN"
            accessibilityRole="button"
            disabled={busy || pin.length !== 6}
            onPress={() => void authenticate('pin')}
            style={[styles.primary, (busy || pin.length !== 6) && styles.disabled]}>
            {busy ? <ActivityIndicator color="#f6fbff" /> : <Text style={styles.primaryText}>Unlock</Text>}
          </Pressable>

          <Pressable
            accessibilityLabel="Unlock wallet with fingerprint"
            accessibilityRole="button"
            disabled={busy}
            onPress={() => void authenticate('biometric')}
            style={[styles.biometric, busy && styles.disabled]}>
            <Text style={styles.biometricIcon}>◉</Text>
            <Text style={styles.biometricText}>Use fingerprint</Text>
          </Pressable>
          {busy ? <Pressable accessibilityRole="button" onPress={cancelAttempt} style={styles.biometric}>
            <Text style={styles.biometricText}>Use PIN instead</Text>
          </Pressable> : null}
        </View>

        <Pressable accessibilityRole="button" onPress={() => setNotice('Recovery options are available from Wallet Settings after you unlock.')} style={styles.help}>
          <Text style={styles.helpText}>Need help?</Text>
        </Pressable>
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#050b1d' },
  keyboardArea: { flex: 1 },
  content: { flexGrow: 1, paddingHorizontal: 28, paddingVertical: 22 },
  brandBlock: { alignItems: 'center', marginTop: 'auto' },
  logo: { borderRadius: 20, height: 88, width: 88 },
  brand: { color: '#f6fbff', fontSize: 22, fontWeight: '900', marginTop: 14 },
  form: { marginTop: 54 },
  label: { color: '#dce9ff', fontSize: 14, fontWeight: '800', marginBottom: 9 },
  input: { backgroundColor: '#08152d', borderColor: '#315c9c', borderRadius: 14, borderWidth: 1, color: '#f6fbff', fontSize: 20, letterSpacing: 7, minHeight: 58, paddingHorizontal: 18, textAlign: 'center' },
  notice: { color: '#f2bbbc', fontSize: 13, lineHeight: 19, marginTop: 12 },
  primary: { alignItems: 'center', backgroundColor: '#347ff0', borderRadius: 14, justifyContent: 'center', marginTop: 20, minHeight: 54 },
  primaryText: { color: '#f6fbff', fontSize: 16, fontWeight: '900' },
  biometric: { alignItems: 'center', flexDirection: 'row', justifyContent: 'center', marginTop: 20, minHeight: 50 },
  biometricIcon: { color: '#76b9ff', fontSize: 20, marginRight: 9 },
  biometricText: { color: '#9fcbff', fontSize: 15, fontWeight: '800' },
  help: { alignItems: 'center', marginTop: 'auto', minHeight: 44, justifyContent: 'center' },
  helpText: { color: '#809cc8', fontSize: 14, fontWeight: '700' },
  disabled: { opacity: 0.48 },
});
