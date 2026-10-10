import { useRouter } from 'expo-router';
import { useEffect, useReducer, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { authenticateStoredSyntheticVaultReplacement } from '@/security/synthetic-vault-replacement-authentication';
import { stageSyntheticTestnetVaultCandidate } from '@/security/synthetic-vault-replacement-stage';
import { beginTestnetRecoverySecretSession } from '@/security/recovery-phrase-generation';
import { destroyActiveRecoverySecretSession, withActiveRecoveryPhrase } from '@/security/recovery-secret-session-manager';
import { verifyRecoveryWordConfirmation } from '@/security/recovery-word-confirmation-core';
import {
  INITIAL_SYNTHETIC_VAULT_REPLACEMENT_STATE,
  transitionSyntheticVaultReplacement,
} from '@/security/synthetic-vault-replacement-machine';
import { useSensitiveScreenProtection } from '@/security/use-sensitive-screen-protection';

const CONFIRMATION_POSITIONS = [4, 13, 22] as const;

export default function SyntheticVaultReplacementScreen() {
  useSensitiveScreenProtection();
  const router = useRouter();
  const [state, dispatch] = useReducer(transitionSyntheticVaultReplacement, INITIAL_SYNTHETIC_VAULT_REPLACEMENT_STATE);
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [words, setWords] = useState<readonly string[]>([]);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [newPin, setNewPin] = useState('');
  const [newPinConfirmation, setNewPinConfirmation] = useState('');
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    dispatch({ type: 'BEGIN' });
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active') {
        destroyActiveRecoverySecretSession();
        setWords([]);
        setAnswers({});
      }
    });
    return () => { mounted.current = false; destroyActiveRecoverySecretSession(); subscription.remove(); };
  }, []);

  async function verifyCurrentPin() {
    if (pin.length !== 6 || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const eligibility = await authenticateStoredSyntheticVaultReplacement(pin);
      if (!eligibility.eligible) {
        setMessage('This vault is not the legacy synthetic test vault. Replacement is blocked and nothing changed.');
        return;
      }
      setPin('');
      dispatch({ type: 'CURRENT_SYNTHETIC_PIN_VERIFIED' });
    } catch {
      setMessage('PIN verification did not succeed. Nothing changed.');
    } finally {
      setPin('');
      setBusy(false);
    }
  }

  async function generateRecovery() {
    setBusy(true);
    setMessage(null);
    try {
      await beginTestnetRecoverySecretSession();
      const nextWords = withActiveRecoveryPhrase((phrase) => phrase.split(' '));
      if (!mounted.current || nextWords.length !== 24) throw new Error('Session unavailable');
      setWords(nextWords);
      dispatch({ type: 'NEW_RECOVERY_GENERATED' });
    } catch {
      destroyActiveRecoverySecretSession();
      if (mounted.current) setMessage('Recovery phrase generation failed. No vault changed.');
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  function beginWordConfirmation() {
    if (words.length !== 24) return;
    setWords([]);
  }

  function confirmRecovery() {
    try {
      const result = withActiveRecoveryPhrase((phrase) => verifyRecoveryWordConfirmation(phrase, { positions: CONFIRMATION_POSITIONS }, CONFIRMATION_POSITIONS.map((position) => ({ position, word: answers[position] ?? '' }))));
      if (!result.ok) {
        setMessage('The selected recovery words do not match. Check your offline copy and try again.');
        return;
      }
      dispatch({ type: 'NEW_RECOVERY_CONFIRMED' });
      setMessage('Recovery phrase confirmed. No vault has been changed yet.');
    } catch {
      destroyActiveRecoverySecretSession();
      setMessage('Recovery session expired. No vault changed.');
    }
  }

  function verifyNewPin() {
    if (!/^\d{6}$/.test(newPin) || newPin !== newPinConfirmation) {
      setMessage('Enter and confirm the same six-digit new PIN.');
      return;
    }
    setMessage(null);
    dispatch({ type: 'NEW_PIN_VERIFIED' });
  }

  async function stageCandidate() {
    const now = Date.now();
    const authorization = transitionSyntheticVaultReplacement(state, { type: 'FINAL_CONFIRMATION', now });
    if (authorization.stage !== 'authorized') return;
    setBusy(true);
    setMessage(null);
    try {
      await stageSyntheticTestnetVaultCandidate(newPin, newPinConfirmation, {
        authorizationExpiresAt: authorization.authorizationExpiresAt,
        requiredAuthentication: 'pin',
        stage: 'authorized',
        targetStatus: 'present',
      }, now);
      dispatch({ type: 'FINAL_CONFIRMATION', now });
      setNewPin('');
      setNewPinConfirmation('');
      setMessage('Testnet wallet candidate verified and staged. The old synthetic vault remains active.');
    } catch {
      setMessage('Candidate staging failed closed. The active synthetic vault was not changed.');
    } finally {
      destroyActiveRecoverySecretSession();
      setWords([]);
      setAnswers({});
      setBusy(false);
    }
  }

  const verified = state.stage === 'awaiting-new-recovery';
  const confirming = state.stage === 'awaiting-recovery-confirmation' && words.length === 0;
  const phraseShown = state.stage === 'awaiting-recovery-confirmation' && words.length === 24;
  const recoveryConfirmed = state.stage === 'awaiting-new-pin';
  const awaitingFinalConfirmation = state.stage === 'awaiting-final-confirmation';
  const staged = state.stage === 'authorized';
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content}>
        <Text style={styles.protected}>SCREEN CAPTURE BLOCKED</Text>
        <Text accessibilityRole="header" style={styles.title}>Replace synthetic test vault</Text>
        <Text style={styles.body}>This route is only for the historical synthetic preview vault. It never replaces unknown or real wallet data.</Text>
        {state.stage === 'awaiting-current-pin' ? <>
          <View style={styles.warning}><Text style={styles.warningTitle}>Current vault PIN required</Text><Text style={styles.warningBody}>Your PIN is verified locally. The decrypted payload is compared only to the fixed legacy synthetic test payload.</Text></View>
          <Text style={styles.label}>Current PIN</Text>
          <TextInput accessibilityLabel="Current synthetic vault PIN" autoComplete="off" keyboardType="number-pad" maxLength={6} onChangeText={(value) => setPin(value.replace(/\D/g, ''))} secureTextEntry style={styles.input} value={pin} />
          <Pressable accessibilityRole="button" disabled={busy || pin.length !== 6} onPress={() => void verifyCurrentPin()} style={({ pressed }) => [styles.primary, (busy || pin.length !== 6) && styles.disabled, pressed && styles.pressed]}>{busy ? <ActivityIndicator color="#062015" /> : <Text style={styles.primaryText}>Verify synthetic vault</Text>}</Pressable>
        </> : null}
        {verified ? <View style={styles.success}><Text style={styles.successTitle}>Synthetic test vault verified</Text><Text style={styles.successBody}>No vault has been changed. Generate a new BSC Testnet recovery phrase only when you are ready to write it down offline.</Text><Pressable accessibilityRole="button" disabled={busy} onPress={() => void generateRecovery()} style={({ pressed }) => [styles.primary, busy && styles.disabled, pressed && styles.pressed]}><Text style={styles.primaryText}>{busy ? 'Generating securely…' : 'Generate 24-word phrase'}</Text></Pressable></View> : null}
        {phraseShown ? <><Text style={styles.phraseHeading}>Write all 24 words on paper in exact order. Do not screenshot, copy, or share them.</Text><View style={styles.words}>{words.map((word, index) => <Text key={index} style={styles.word}>{index + 1}. {word}</Text>)}</View><Pressable accessibilityRole="button" onPress={beginWordConfirmation} style={({ pressed }) => [styles.primary, pressed && styles.pressed]}><Text style={styles.primaryText}>I wrote it down</Text></Pressable></> : null}
        {confirming ? <View style={styles.confirmation}><Text style={styles.phraseHeading}>Confirm these words from your offline copy.</Text>{CONFIRMATION_POSITIONS.map((position) => <View key={position}><Text style={styles.label}>Word #{position}</Text><TextInput accessibilityLabel={`Replacement recovery word ${position}`} autoCapitalize="none" autoCorrect={false} onChangeText={(value) => setAnswers((current) => ({ ...current, [position]: value }))} style={styles.input} value={answers[position] ?? ''} /></View>)}<Pressable accessibilityRole="button" onPress={confirmRecovery} style={({ pressed }) => [styles.primary, pressed && styles.pressed]}><Text style={styles.primaryText}>Confirm recovery words</Text></Pressable></View> : null}
        {recoveryConfirmed ? <View style={styles.success}><Text style={styles.successTitle}>Recovery phrase confirmed</Text><Text style={styles.successBody}>Choose a new six-digit PIN for the separate Testnet candidate vault.</Text><Text style={styles.label}>New PIN</Text><TextInput accessibilityLabel="New candidate wallet PIN" autoComplete="off" keyboardType="number-pad" maxLength={6} onChangeText={(value) => setNewPin(value.replace(/\D/g, ''))} secureTextEntry style={styles.input} value={newPin} /><Text style={styles.label}>Confirm new PIN</Text><TextInput accessibilityLabel="Confirm candidate wallet PIN" autoComplete="off" keyboardType="number-pad" maxLength={6} onChangeText={(value) => setNewPinConfirmation(value.replace(/\D/g, ''))} secureTextEntry style={styles.input} value={newPinConfirmation} /><Pressable accessibilityRole="button" onPress={verifyNewPin} style={({ pressed }) => [styles.primary, pressed && styles.pressed]}><Text style={styles.primaryText}>Verify new PIN</Text></Pressable></View> : null}
        {awaitingFinalConfirmation ? <View style={styles.warning}><Text style={styles.warningTitle}>Stage candidate only</Text><Text style={styles.warningBody}>This writes a separately encrypted BSC Testnet candidate and its verification journal. It does not replace, promote, delete, or unlock the old synthetic vault.</Text><Pressable accessibilityRole="button" disabled={busy} onPress={() => void stageCandidate()} style={({ pressed }) => [styles.primary, busy && styles.disabled, pressed && styles.pressed]}>{busy ? <ActivityIndicator color="#062015" /> : <Text style={styles.primaryText}>Stage verified Testnet candidate</Text>}</Pressable></View> : null}
        {staged ? <View style={styles.success}><Text style={styles.successTitle}>Candidate staged</Text><Text style={styles.successBody}>No old vault cleanup or promotion occurred in this step. Review and promotion require a separate approval.</Text></View> : null}
        {message ? <Text accessibilityRole="alert" style={styles.error}>{message}</Text> : null}
        <Pressable accessibilityRole="button" onPress={() => router.replace('/wallet')} style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}><Text style={styles.secondaryText}>Return to secure wallet</Text></Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#071310' }, content: { flex: 1, justifyContent: 'center', padding: 24 }, protected: { color: '#f3ba2f', fontSize: 11, fontWeight: '900', letterSpacing: 1.6 }, title: { color: '#f6fbf8', fontSize: 29, fontWeight: '800', marginTop: 12 }, body: { color: '#9eb2a9', fontSize: 15, lineHeight: 23, marginTop: 12 }, warning: { backgroundColor: '#251c0e', borderColor: '#765b20', borderRadius: 14, borderWidth: 1, marginTop: 22, padding: 15 }, warningTitle: { color: '#ffe4a3', fontSize: 15, fontWeight: '800' }, warningBody: { color: '#d2bd8d', fontSize: 13, lineHeight: 20, marginTop: 6 }, label: { color: '#dff8eb', fontSize: 13, fontWeight: '800', marginBottom: 8, marginTop: 18 }, input: { backgroundColor: '#0b1e18', borderColor: '#2f5145', borderRadius: 14, borderWidth: 1, color: '#f6fbf8', fontSize: 16, paddingHorizontal: 18, paddingVertical: 14 }, primary: { alignItems: 'center', backgroundColor: '#7cf6bd', borderRadius: 14, marginTop: 20, minHeight: 52, justifyContent: 'center' }, primaryText: { color: '#062015', fontSize: 15, fontWeight: '900' }, disabled: { opacity: 0.45 }, secondary: { alignItems: 'center', borderColor: '#7cf6bd', borderRadius: 14, borderWidth: 1, marginTop: 18, paddingVertical: 14 }, secondaryText: { color: '#7cf6bd', fontSize: 14, fontWeight: '800' }, success: { backgroundColor: '#0b1e18', borderColor: '#2f8062', borderRadius: 14, borderWidth: 1, marginTop: 22, padding: 16 }, successTitle: { color: '#7cf6bd', fontSize: 16, fontWeight: '800' }, successBody: { color: '#b9d5c6', fontSize: 13, lineHeight: 20, marginTop: 7 }, words: { backgroundColor: '#0b1e18', borderColor: '#2f5145', borderRadius: 14, borderWidth: 1, flexDirection: 'row', flexWrap: 'wrap', marginTop: 16, padding: 14 }, word: { color: '#f6fbf8', fontSize: 13, lineHeight: 28, width: '50%' }, phraseHeading: { color: '#dff8eb', fontSize: 13, lineHeight: 20, marginTop: 16 }, confirmation: { marginTop: 10 }, error: { color: '#ffaaa0', fontSize: 13, lineHeight: 19, marginTop: 15 }, pressed: { opacity: 0.78 },
});
