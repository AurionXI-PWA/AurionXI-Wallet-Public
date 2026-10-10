import { Redirect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getRecoveryWordsFromPayload } from '@/security/mainnet-recovery-view-core';
import { zeroizeBytes } from '@/security/secret-memory';
import { useSessionLock } from '@/security/session-lock-provider';
import { useSensitiveScreenProtection } from '@/security/use-sensitive-screen-protection';
import { unlockStoredVaultWithBiometrics } from '@/security/vault-biometric-workflow';
import { unlockStoredTestnetVaultWithRetry } from '@/security/vault-workflow';

const REVEAL_TIMEOUT_MS = 60_000;

/**
 * Shows only the separately encrypted Testnet recovery phrase after fresh
 * local PIN or biometric authentication. It cannot read the Mainnet vault.
 */
export default function TestnetRecoveryViewScreen() {
  useSensitiveScreenProtection();
  const router = useRouter();
  const { isLocked, recordActivity } = useSessionLock();
  const screenActive = useRef(true);
  const [pin, setPin] = useState('');
  const [words, setWords] = useState<readonly string[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string>();

  const hidePhrase = useCallback(() => {
    setWords([]);
    setPin('');
  }, []);

  const returnToSettings = useCallback(() => {
    hidePhrase();
    router.replace('/wallet/settings' as never);
  }, [hidePhrase, router]);

  useEffect(() => {
    screenActive.current = true;
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active') {
        screenActive.current = false;
        returnToSettings();
      }
    });
    return () => {
      screenActive.current = false;
      subscription.remove();
      hidePhrase();
    };
  }, [hidePhrase, returnToSettings]);

  useEffect(() => {
    if (!words.length) return undefined;
    const timeout = setTimeout(returnToSettings, REVEAL_TIMEOUT_MS);
    return () => clearTimeout(timeout);
  }, [returnToSettings, words.length]);

  if (isLocked) return <Redirect href={'/wallet' as never} />;

  async function authenticate(method: 'pin' | 'biometric') {
    if (busy) return;
    let payload: Uint8Array | undefined;
    setBusy(true);
    setNotice(undefined);
    try {
      payload = method === 'pin'
        ? await unlockStoredTestnetVaultWithRetry(pin)
        : await unlockStoredVaultWithBiometrics();
      if (!screenActive.current) return;
      setWords(getRecoveryWordsFromPayload(payload));
      setPin('');
      recordActivity();
    } catch {
      if (screenActive.current) {
        setPin('');
        setNotice(method === 'pin' ? 'PIN verification failed. Try again.' : 'Biometric verification did not complete. Use your PIN instead.');
      }
    } finally {
      zeroizeBytes(payload);
      if (screenActive.current) setBusy(false);
    }
  }

  const isRevealed = words.length > 0;
  return <SafeAreaView style={styles.safeArea}>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.protected}>SCREEN CAPTURE BLOCKED</Text>
      <Text style={styles.title}>{isRevealed ? 'Your Testnet recovery phrase' : 'View Testnet recovery phrase'}</Text>
      <Text style={styles.body}>{isRevealed
        ? 'Write these words on paper in exact order. Never share them with anyone.'
        : 'Verify your identity to view this separate Testnet wallet recovery phrase. Keep your screen private.'}</Text>

      {isRevealed ? <View style={styles.wordsCard}>
        {words.map((word, index) => <View key={index} style={styles.wordRow}>
          <Text style={styles.wordNumber}>{index + 1}</Text><Text style={styles.word}>{word}</Text>
        </View>)}
      </View> : <View style={styles.authCard}>
        <Text style={styles.label}>Enter Testnet PIN</Text>
        <TextInput accessibilityLabel="Testnet wallet six-digit PIN to view recovery phrase" autoComplete="off" editable={!busy} keyboardType="number-pad" maxLength={6} onChangeText={(value) => setPin(value.replace(/\D/g, ''))} secureTextEntry style={styles.input} value={pin} />
        {notice ? <Text accessibilityRole="alert" style={styles.notice}>{notice}</Text> : null}
        <Pressable accessibilityLabel="Verify Testnet PIN to view recovery phrase" accessibilityRole="button" disabled={busy || pin.length !== 6} onPress={() => void authenticate('pin')} style={[styles.primary, (busy || pin.length !== 6) && styles.disabled]}>
          {busy ? <ActivityIndicator color="#f7fbff" /> : <Text style={styles.primaryText}>Verify PIN</Text>}
        </Pressable>
        <Pressable accessibilityLabel="Use Testnet biometrics to view recovery phrase" accessibilityRole="button" disabled={busy} onPress={() => void authenticate('biometric')} style={[styles.secondary, busy && styles.disabled]}><Text style={styles.secondaryText}>Use biometrics</Text></Pressable>
      </View>}
      <Pressable accessibilityRole="button" onPress={returnToSettings} style={isRevealed ? styles.primary : styles.cancel}><Text style={isRevealed ? styles.primaryText : styles.cancelText}>{isRevealed ? 'I wrote it down' : 'Cancel'}</Text></Pressable>
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#050b1d' }, content: { padding: 24, paddingBottom: 42 }, protected: { color: '#7cf6bd', fontSize: 11, fontWeight: '900', letterSpacing: 1.4, marginTop: 14 }, title: { color: '#f7fbff', fontSize: 30, fontWeight: '900', marginTop: 10 }, body: { color: '#afc1df', fontSize: 15, lineHeight: 23, marginTop: 10 }, authCard: { backgroundColor: '#0c3028', borderColor: '#38b98a', borderRadius: 16, borderWidth: 1, marginTop: 24, padding: 16 }, label: { color: '#d5fff0', fontSize: 14, fontWeight: '800', marginBottom: 9 }, input: { backgroundColor: '#08251f', borderColor: '#318b6d', borderRadius: 12, borderWidth: 1, color: '#f8fbff', fontSize: 19, letterSpacing: 6, minHeight: 56, paddingHorizontal: 16, textAlign: 'center' }, notice: { color: '#ffc2bc', fontSize: 13, lineHeight: 19, marginTop: 12 }, primary: { alignItems: 'center', backgroundColor: '#38b98a', borderRadius: 14, justifyContent: 'center', marginTop: 18, minHeight: 54 }, primaryText: { color: '#05241b', fontSize: 15, fontWeight: '900' }, secondary: { alignItems: 'center', borderColor: '#67d8ae', borderRadius: 14, borderWidth: 1, justifyContent: 'center', marginTop: 12, minHeight: 52 }, secondaryText: { color: '#a7f2d2', fontSize: 15, fontWeight: '900' }, cancel: { alignItems: 'center', justifyContent: 'center', marginTop: 18, minHeight: 52 }, cancelText: { color: '#8be4c0', fontSize: 15, fontWeight: '800' }, disabled: { opacity: 0.48 }, wordsCard: { backgroundColor: '#0c3028', borderColor: '#38b98a', borderRadius: 16, borderWidth: 1, flexDirection: 'row', flexWrap: 'wrap', marginTop: 24, padding: 12 }, wordRow: { alignItems: 'center', flexDirection: 'row', minHeight: 42, paddingHorizontal: 6, width: '50%' }, wordNumber: { color: '#7cf6bd', fontSize: 12, fontWeight: '900', width: 30 }, word: { color: '#f7fbff', fontSize: 14, fontWeight: '800' },
});
