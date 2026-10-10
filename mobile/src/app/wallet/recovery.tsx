import { Redirect, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { AppState, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { beginTestnetRecoverySecretSession } from '@/security/recovery-phrase-generation';
import { beginImportedTestnetRecoverySession } from '@/security/recovery-phrase-import';
import { destroyActiveRecoverySecretSession, withActiveRecoveryPhrase } from '@/security/recovery-secret-session-manager';
import { verifyRecoveryWordConfirmation } from '@/security/recovery-word-confirmation-core';
import { useSensitiveScreenProtection } from '@/security/use-sensitive-screen-protection';
import { useWalletOnboarding } from '@/security/wallet-onboarding-provider';
import { canAccessWalletOnboardingRoute } from '@/security/wallet-onboarding-machine';

const CONFIRMATION_POSITIONS = [3, 17, 24] as const;
const EMPTY_RECOVERY_WORDS = () => Array.from({ length: 24 }, () => '');

export default function RecoveryProtectionScreen() {
  useSensitiveScreenProtection();
  const router = useRouter();
  const { dispatch, state } = useWalletOnboarding();
  const [words, setWords] = useState<readonly string[]>([]);
  const [recoveryWords, setRecoveryWords] = useState<string[]>(EMPTY_RECOVERY_WORDS);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    mounted.current = true;
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active') {
        destroyActiveRecoverySecretSession();
        setWords([]);
        setAnswers({});
        setRecoveryWords(EMPTY_RECOVERY_WORDS());
      }
    });
    return () => { mounted.current = false; subscription.remove(); };
  }, []);

  if (!canAccessWalletOnboardingRoute(state, 'recovery')) return <Redirect href="/wallet" />;

  const discard = () => {
    destroyActiveRecoverySecretSession();
    setWords([]);
    setAnswers({});
    setRecoveryWords(EMPTY_RECOVERY_WORDS());
    // This flow is leaving onboarding entirely. A single BACK would leave the
    // state machine on "responsibility", making the next Create/Import tap a
    // no-op until the app was restarted.
    dispatch({ type: 'RESET' });
    router.replace('/wallet');
  };

  async function revealNewPhrase() {
    setBusy(true);
    setError(null);
    try {
      await beginTestnetRecoverySecretSession();
      const nextWords = withActiveRecoveryPhrase((phrase) => phrase.split(' '));
      if (!mounted.current || nextWords.length !== 24) throw new Error('Session unavailable');
      setWords(nextWords);
    } catch {
      destroyActiveRecoverySecretSession();
      if (mounted.current) setError('Recovery phrase generation failed. No wallet was created.');
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  function continueToConfirmation() {
    if (words.length !== 24) return;
    setWords([]);
    dispatch({ type: 'RECOVERY_MATERIAL_READY' });
  }

  function confirmWords() {
    setError(null);
    try {
      const result = withActiveRecoveryPhrase((phrase) => verifyRecoveryWordConfirmation(phrase, {
        positions: CONFIRMATION_POSITIONS,
      }, CONFIRMATION_POSITIONS.map((position) => ({ position, word: answers[position] ?? '' }))));
      if (!result.ok) {
        setError('The selected recovery words do not match. Check your offline copy and try again.');
        return;
      }
      dispatch({ type: 'CONFIRM_RECOVERY' });
      router.replace('/wallet/pin');
    } catch {
      setError('Recovery session expired. Start again; no wallet was created.');
      discard();
    }
  }

  function validateImportedPhrase() {
    setError(null);
    setBusy(true);
    try {
      beginImportedTestnetRecoverySession(recoveryWords.join(' '));
      setRecoveryWords(EMPTY_RECOVERY_WORDS());
      dispatch({ type: 'RECOVERY_MATERIAL_READY' });
      router.replace('/wallet/pin');
    } catch {
      destroyActiveRecoverySecretSession();
      setError('Recovery phrase is invalid. Check all 24 words and their order. Nothing was stored.');
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  function updateRecoveryWord(index: number, value: string) {
    setError(null);
    setRecoveryWords((current) => current.map((word, wordIndex) => (
      wordIndex === index ? value.trim().toLowerCase() : word
    )));
  }

  const createFlow = state.flow === 'create';
  const showingPhrase = createFlow && state.stage === 'recovery-display';
  const confirmingPhrase = createFlow && state.stage === 'recovery-confirmation';
  const enteringImportedPhrase = state.flow === 'import' && state.stage === 'recovery-entry';

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView ref={scrollRef} automaticallyAdjustKeyboardInsets contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.protected}>SCREEN CAPTURE BLOCKED</Text>
        <Text accessibilityRole="header" style={styles.title}>{showingPhrase ? 'Protect your recovery phrase' : confirmingPhrase ? 'Confirm your recovery phrase' : enteringImportedPhrase ? 'Import Testnet recovery phrase' : 'Recovery & backup policy'}</Text>
        <Text style={styles.body}>{showingPhrase ? 'Write all 24 words on paper in their exact order. Do not screenshot, copy, or share them.' : confirmingPhrase ? 'Enter the requested words from your offline copy. They are checked only in memory.' : enteringImportedPhrase ? 'Enter all 24 words in their exact order. They are validated only on this device and are never sent to AurionXI.' : 'Recovery material is never transmitted to AurionXI.'}</Text>
        {showingPhrase ? (words.length === 24 ? <View style={styles.words}>{words.map((word, index) => <Text key={index} style={styles.word}>{index + 1}. {word}</Text>)}</View> : <View style={styles.gate}><Text style={styles.gateTitle}>Ready to generate</Text><Text style={styles.gateBody}>Generated only on this device from secure random entropy.</Text></View>) : confirmingPhrase ? <View style={styles.confirmation}>{CONFIRMATION_POSITIONS.map((position) => <View key={position}><Text style={styles.label}>Word #{position}</Text><TextInput accessibilityLabel={`Recovery word ${position}`} autoCapitalize="none" autoCorrect={false} editable={!busy} onChangeText={(value) => setAnswers((current) => ({ ...current, [position]: value }))} style={styles.input} value={answers[position] ?? ''} /></View>)}</View> : enteringImportedPhrase ? <View style={styles.recoveryGrid}>{recoveryWords.map((word, index) => <View key={index} style={styles.recoveryField}><Text style={styles.label}>Word {index + 1}</Text><TextInput accessibilityLabel={`Testnet recovery word ${index + 1}`} autoCapitalize="none" autoCorrect={false} editable={!busy} onChangeText={(value) => updateRecoveryWord(index, value)} onFocus={() => scrollRef.current?.scrollTo({ y: Math.max(0, 72 + Math.floor(index / 3) * 96), animated: true })} style={styles.input} value={word} /></View>)}</View> : <View style={styles.gate}><Text style={styles.gateTitle}>Recovery session required</Text><Text style={styles.gateBody}>Return and choose a recovery flow.</Text></View>}
        {error ? <Text accessibilityLiveRegion="assertive" accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        {showingPhrase && words.length === 0 ? <Pressable accessibilityRole="button" disabled={busy} onPress={() => void revealNewPhrase()} style={({ pressed }) => [styles.primary, busy && styles.disabled, pressed && styles.pressed]}><Text style={styles.primaryText}>{busy ? 'Generating securely…' : 'Generate 24-word phrase'}</Text></Pressable> : null}
        {showingPhrase && words.length === 24 ? <Pressable accessibilityRole="button" onPress={continueToConfirmation} style={({ pressed }) => [styles.primary, pressed && styles.pressed]}><Text style={styles.primaryText}>I wrote it down</Text></Pressable> : null}
        {confirmingPhrase ? <Pressable accessibilityRole="button" onPress={confirmWords} style={({ pressed }) => [styles.primary, pressed && styles.pressed]}><Text style={styles.primaryText}>Confirm recovery words</Text></Pressable> : null}
        {enteringImportedPhrase ? <Pressable accessibilityLabel="Validate imported Testnet recovery phrase" accessibilityRole="button" disabled={busy || recoveryWords.some((word) => !word)} onPress={validateImportedPhrase} style={({ pressed }) => [styles.primary, (busy || recoveryWords.some((word) => !word)) && styles.disabled, pressed && styles.pressed]}><Text style={styles.primaryText}>{busy ? 'Validating securely…' : 'Validate and continue'}</Text></Pressable> : null}
        <Pressable accessibilityRole="button" onPress={discard} style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}><Text style={styles.secondaryText}>Return without recovery action</Text></Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#071310' }, content: { flexGrow: 1, padding: 24, paddingBottom: 280 },
  protected: { color: '#f3ba2f', fontSize: 11, fontWeight: '900', letterSpacing: 1.6 }, title: { color: '#f6fbf8', fontSize: 28, fontWeight: '800', marginTop: 12 }, body: { color: '#9eb2a9', fontSize: 15, lineHeight: 23, marginTop: 14 },
  gate: { backgroundColor: '#0b1e18', borderColor: '#2f5145', borderWidth: 1, borderRadius: 16, padding: 17, marginTop: 20 }, gateTitle: { color: '#dff8eb', fontSize: 15, fontWeight: '800' }, gateBody: { color: '#8ea49a', fontSize: 13, lineHeight: 20, marginTop: 6 },
  words: { backgroundColor: '#0b1e18', borderColor: '#2f5145', borderRadius: 14, borderWidth: 1, flexDirection: 'row', flexWrap: 'wrap', marginTop: 20, padding: 14 }, word: { color: '#f6fbf8', fontSize: 13, lineHeight: 28, width: '50%' },
  confirmation: { marginTop: 14 }, recoveryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }, recoveryField: { marginTop: 4, width: '31.7%' }, label: { color: '#dff8eb', fontSize: 11, fontWeight: '800', marginBottom: 6, marginTop: 8 }, input: { backgroundColor: '#0b1e18', borderColor: '#2f5145', borderRadius: 10, borderWidth: 1, color: '#f6fbf8', fontSize: 14, paddingHorizontal: 9, paddingVertical: 12 },
  error: { color: '#ffaaa0', fontSize: 13, lineHeight: 19, marginTop: 14 }, primary: { alignItems: 'center', backgroundColor: '#7cf6bd', borderRadius: 14, marginTop: 20, paddingVertical: 15 }, primaryText: { color: '#062015', fontSize: 15, fontWeight: '900' }, disabled: { opacity: 0.5 },
  secondary: { borderColor: '#7cf6bd', borderWidth: 1, borderRadius: 14, alignItems: 'center', paddingVertical: 15, marginTop: 14 }, secondaryText: { color: '#7cf6bd', fontSize: 15, fontWeight: '800' }, pressed: { opacity: 0.78 },
});
