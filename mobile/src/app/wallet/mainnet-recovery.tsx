import { Redirect, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { AppState, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useMainnetOnboarding } from '@/security/mainnet-onboarding-provider';
import { canAccessMainnetOnboardingRoute } from '@/security/mainnet-onboarding-machine';
import { beginImportedMainnetRecoverySession, beginNewMainnetRecoverySession } from '@/security/mainnet-recovery-session';
import { destroyActiveMainnetRecoverySecretSession, withActiveMainnetRecoveryPhrase } from '@/security/mainnet-recovery-secret-session-manager';
import { verifyRecoveryWordConfirmation } from '@/security/recovery-word-confirmation-core';
import { useSensitiveScreenProtection } from '@/security/use-sensitive-screen-protection';

const POSITIONS = [3, 17, 24] as const;
const EMPTY_RECOVERY_WORDS = () => Array.from({ length: 24 }, () => '');

export default function MainnetRecoveryScreen() {
  useSensitiveScreenProtection();
  const router = useRouter();
  const { state, dispatch } = useMainnetOnboarding();
  const [words, setWords] = useState<readonly string[]>([]);
  const [recoveryWords, setRecoveryWords] = useState<string[]>(EMPTY_RECOVERY_WORDS);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [error, setError] = useState<string>();
  const mounted = useRef(true);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active') {
        destroyActiveMainnetRecoverySecretSession();
        setWords([]);
        setRecoveryWords(EMPTY_RECOVERY_WORDS());
        setAnswers({});
      }
    });
    return () => { mounted.current = false; sub.remove(); };
  }, []);

  if (!canAccessMainnetOnboardingRoute(state, 'recovery')) return <Redirect href={'/wallet/mainnet-onboarding' as never} />;

  const create = state.flow === 'create';
  const showing = create && state.stage === 'recovery-display';
  const confirming = create && state.stage === 'recovery-confirmation';
  const importing = state.flow === 'import' && state.stage === 'recovery-entry';
  const hasAllRecoveryWords = recoveryWords.every((word) => word.length > 0);

  const cancel = () => {
    destroyActiveMainnetRecoverySecretSession();
    dispatch({ type: 'RESET' });
    router.replace('/wallet/mainnet-onboarding' as never);
  };

  async function reveal() {
    setError(undefined);
    try {
      await beginNewMainnetRecoverySession();
      const next = withActiveMainnetRecoveryPhrase((value) => value.split(' '));
      if (next.length !== 24) throw new Error();
      setWords(next);
    } catch {
      destroyActiveMainnetRecoverySecretSession();
      setError('Recovery phrase generation failed. No Mainnet wallet was created.');
    }
  }

  function confirm() {
    try {
      const result = withActiveMainnetRecoveryPhrase((value) => verifyRecoveryWordConfirmation(
        value,
        { positions: POSITIONS },
        POSITIONS.map((position) => ({ position, word: answers[position] ?? '' })),
      ));
      if (!result.ok) {
        setError('The selected words do not match. Check your offline copy.');
        return;
      }
      dispatch({ type: 'CONFIRM_RECOVERY' });
      router.replace('/wallet/mainnet-pin' as never);
    } catch {
      cancel();
    }
  }

  function updateRecoveryWord(index: number, value: string) {
    setError(undefined);
    setRecoveryWords((current) => current.map((word, wordIndex) => (
      wordIndex === index ? value.trim().toLowerCase() : word
    )));
  }

  function importPhrase() {
    try {
      beginImportedMainnetRecoverySession(recoveryWords.join(' '));
      setRecoveryWords(EMPTY_RECOVERY_WORDS());
      dispatch({ type: 'RECOVERY_MATERIAL_READY' });
      router.replace('/wallet/mainnet-pin' as never);
    } catch {
      destroyActiveMainnetRecoverySecretSession();
      setError('Recovery phrase is invalid. Nothing was stored.');
    }
  }

  return <SafeAreaView style={styles.safeArea}><ScrollView ref={scrollRef} automaticallyAdjustKeyboardInsets contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <Text style={styles.protected}>SCREEN CAPTURE BLOCKED</Text>
    <Text style={styles.title}>{showing ? 'Back up your recovery phrase' : confirming ? 'Confirm your recovery phrase' : 'Import recovery phrase'}</Text>
    <Text style={styles.body}>{showing
      ? 'Write all 24 words on paper in exact order. Do not screenshot, copy, or share them.'
      : confirming
        ? 'Enter the requested words from your offline copy. They are checked only in memory.'
        : 'Enter each of the 24 words in its numbered position. They are validated only on this device and never sent to AurionXI.'}</Text>

    {showing ? (words.length
      ? <View style={styles.words}>{words.map((word, index) => <Text key={index} style={styles.word}>{index + 1}. {word}</Text>)}</View>
      : <View style={styles.gate}><Text style={styles.gateText}>Ready to create your recovery phrase.</Text></View>) : null}

    {confirming ? <View>{POSITIONS.map((position) => <View key={position}>
      <Text style={styles.label}>Word #{position}</Text>
      <TextInput accessibilityLabel={`Recovery word ${position}`} autoCapitalize="none" autoCorrect={false} onChangeText={(value) => setAnswers((old) => ({ ...old, [position]: value }))} style={styles.input} value={answers[position] ?? ''} />
    </View>)}</View> : null}

    {importing ? <View style={styles.recoveryGrid}>{recoveryWords.map((word, index) => <View key={index} style={styles.recoveryField}>
      <Text style={styles.label}>Word {index + 1}</Text>
      <TextInput accessibilityLabel={`Recovery word ${index + 1}`} autoCapitalize="none" autoCorrect={false} onChangeText={(value) => updateRecoveryWord(index, value)} onFocus={() => scrollRef.current?.scrollTo({ y: Math.max(0, 72 + Math.floor(index / 3) * 96), animated: true })} style={styles.input} value={word} />
    </View>)}</View> : null}

    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    {showing && !words.length ? <Pressable accessibilityRole="button" onPress={() => void reveal()} style={styles.primary}><Text style={styles.primaryText}>Generate recovery phrase</Text></Pressable> : null}
    {showing && words.length ? <Pressable accessibilityRole="button" onPress={() => { setWords([]); dispatch({ type: 'RECOVERY_MATERIAL_READY' }); }} style={styles.primary}><Text style={styles.primaryText}>I wrote it down</Text></Pressable> : null}
    {confirming ? <Pressable accessibilityRole="button" onPress={confirm} style={styles.primary}><Text style={styles.primaryText}>Confirm recovery words</Text></Pressable> : null}
    {importing ? <Pressable accessibilityRole="button" disabled={!hasAllRecoveryWords} onPress={importPhrase} style={[styles.primary, !hasAllRecoveryWords && styles.disabled]}><Text style={styles.primaryText}>Validate and continue</Text></Pressable> : null}
    <Pressable accessibilityRole="button" onPress={cancel} style={styles.secondary}><Text style={styles.secondaryText}>Cancel</Text></Pressable>
  </ScrollView></SafeAreaView>;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#04091b' },
  content: { padding: 24, paddingBottom: 280 },
  protected: { color: '#f3c65a', fontSize: 11, fontWeight: '900', letterSpacing: 1.5, marginTop: 12 },
  title: { color: '#f8fbff', fontSize: 28, fontWeight: '900', marginTop: 12 },
  body: { color: '#afc1df', fontSize: 15, lineHeight: 23, marginTop: 14 },
  gate: { backgroundColor: '#0b1b3b', borderColor: '#326fce', borderRadius: 14, borderWidth: 1, marginTop: 20, padding: 16 },
  gateText: { color: '#d8e9ff', fontWeight: '800' },
  words: { backgroundColor: '#0b1b3b', borderColor: '#326fce', borderRadius: 14, borderWidth: 1, flexDirection: 'row', flexWrap: 'wrap', marginTop: 20, padding: 14 },
  word: { color: '#f8fbff', fontSize: 13, lineHeight: 28, width: '50%' },
  recoveryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  recoveryField: { marginTop: 4, width: '31.7%' },
  label: { color: '#dbeaff', fontSize: 11, fontWeight: '800', marginBottom: 6, marginTop: 8 },
  input: { backgroundColor: '#091a38', borderColor: '#477fcb', borderRadius: 10, borderWidth: 1, color: '#f8fbff', fontSize: 14, paddingHorizontal: 9, paddingVertical: 12 },
  primary: { alignItems: 'center', backgroundColor: '#3b82f6', borderRadius: 14, marginTop: 20, paddingVertical: 15 },
  primaryText: { color: '#f8fbff', fontSize: 15, fontWeight: '900' },
  secondary: { alignItems: 'center', borderColor: '#609cf4', borderRadius: 14, borderWidth: 1, marginTop: 14, paddingVertical: 15 },
  secondaryText: { color: '#cfe5ff', fontSize: 15, fontWeight: '800' },
  error: { color: '#ffc2bc', fontSize: 13, lineHeight: 19, marginTop: 14 },
  disabled: { opacity: 0.45 },
});
