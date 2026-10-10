import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Pressable, ScrollView, Text, View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { formatUnits, type Address, type Hash } from 'viem';
import { prepareMainnetReplacementNatively, sendMainnetReviewNatively } from '@/security/mainnet-native-signer';
import type { MainnetReviewEnvelope } from '@/security/mainnet-review-envelope';
import { useMainnetSessionLock } from '@/security/mainnet-session-lock-provider';
import { useSensitiveScreenProtection } from '@/security/use-sensitive-screen-protection';
import { useMainnetTransfers } from '@/hooks/use-mainnet-transfers';
import { MainnetSupportReportButton } from '@/components/mainnet-support-report-button';
import { MainnetTransferRecoveryCard } from '@/components/mainnet-transfer-recovery-card';

/** Route parameters are untrusted public pointers; native journal authority reconstructs every detail. */
export default function MainnetReplacementReviewScreen() {
  useSensitiveScreenProtection();
  const router = useRouter();
  const params = useLocalSearchParams<{ sender?: string; nonce?: string; hash?: string; kind?: string }>();
  const { authorizationEpoch, isAuthorizationActive, isLocked } = useMainnetSessionLock();
  const sender = typeof params.sender === 'string' && /^0x[0-9a-fA-F]{40}$/.test(params.sender) ? params.sender as Address : undefined;
  const hash = typeof params.hash === 'string' && /^0x[0-9a-fA-F]{64}$/.test(params.hash) ? params.hash as Hash : undefined;
  const nonce = typeof params.nonce === 'string' && /^(0|[1-9][0-9]*)$/.test(params.nonce) ? Number(params.nonce) : NaN;
  const kind = params.kind === 'cancel' || params.kind === 'speed-up' ? params.kind : undefined;
  const label = kind === 'cancel' ? 'Cancel' : 'Retry / Speed Up';
  const valid = kind && sender && hash && Number.isSafeInteger(nonce) && nonce >= 0;
  const [review, setReview] = useState<MainnetReviewEnvelope>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();
  const [submittedHash, setSubmittedHash] = useState<Hash>();
  const [now, setNow] = useState(Date.now());
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const pointer = [sender, nonce, hash, kind].join(':');
  const pointerRef = useRef(pointer);
  pointerRef.current = pointer;
  const transfers = useMainnetTransfers(sender, !isLocked);
  useEffect(() => { mounted.current = true; const timer = setInterval(() => setNow(Date.now()), 1000);
    const sub = AppState.addEventListener('change', state => { if (state === 'background') setReview(undefined); });
    return () => { mounted.current = false; clearInterval(timer); sub.remove(); }; }, []);
  useEffect(() => setReview(undefined), [authorizationEpoch, pointer]);
  const expired = !review || now >= review.observedAt + 90_000;
  const candidates = transfers.records.filter(r => r.transactionHash.toLowerCase() === submittedHash?.toLowerCase() || r.replacesTransactionHash?.toLowerCase() === hash?.toLowerCase());
  const original = transfers.records.find(r => r.transactionHash.toLowerCase() === hash?.toLowerCase());

  async function prepare() {
    if (!valid || !kind || !sender || !hash || inFlight.current || submittedHash || !isAuthorizationActive(authorizationEpoch)) return;
    const epoch = authorizationEpoch; const requestedPointer = pointer; inFlight.current = true; setBusy(true); setReview(undefined); setMessage(undefined);
    try { const next = await prepareMainnetReplacementNatively(sender, nonce, hash, kind);
      if (mounted.current && pointerRef.current === requestedPointer && isAuthorizationActive(epoch)) setReview(next);
    } catch (error) { if (mounted.current) setMessage(error instanceof Error ? error.message : 'Replacement review unavailable. Check recovery status.'); }
    finally { inFlight.current = false; if (mounted.current) setBusy(false); }
  }
  async function submitReplacement() {
    if (!review || review.replacementKind !== kind || review.replacesTransactionHash?.toLowerCase() !== hash?.toLowerCase() || review.nonce !== nonce || expired || inFlight.current || submittedHash || !isAuthorizationActive(authorizationEpoch)) return;
    inFlight.current = true; setBusy(true); setMessage(undefined);
    try { const result = await sendMainnetReviewNatively(review, authorizationEpoch);
      if (!mounted.current) return;
      setSubmittedHash(result.transactionHash); setReview(undefined);
      setMessage(result.state === 'not-submitted' ? 'Replacement was not submitted. Check recovery status before preparing again.'
        : `${label} attempted once. Check its exact receipt. The original can still win until this nonce is confirmed.`);
      transfers.refresh();
    } catch (error) { if (mounted.current) { setReview(undefined); setMessage(error instanceof Error ? error.message : 'Replacement did not complete. Check Activity before retrying.'); } }
    finally { inFlight.current = false; if (mounted.current) setBusy(false); }
  }
  return <SafeAreaView style={styles.safe}><ScrollView contentContainerStyle={styles.content}>
    <Text style={styles.title}>{label} previous transfer</Text>
    <Text style={styles.body}>{kind === 'cancel' ? 'Cancellation sends 0 BNB to this same wallet. You pay its BNB network fee if mined.' : 'Retry keeps the original recipient, asset and amount. It uses the original nonce with a higher network fee.'} The first transaction confirmed at this nonce wins. Status is checked for both hashes.</Text>
    <View style={styles.card}><Text style={styles.body}>Network: BNB Smart Chain · Mainnet (56)</Text><Text selectable style={styles.body}>Wallet: {sender ?? 'Invalid wallet'}</Text><Text style={styles.body}>Nonce: {Number.isSafeInteger(nonce) ? nonce : 'Invalid'}</Text><Text selectable style={styles.body}>Original hash: {hash ?? 'Invalid hash'}</Text></View>
    {!submittedHash ? <Pressable disabled={!valid || busy || isLocked || transfers.refreshing} style={styles.button} onPress={() => void prepare()}><Text style={styles.buttonText}>Review {label} fee</Text></Pressable> : null}
    {review ? <View style={styles.card}><Text style={styles.body}>Recipient: {review.recipient}</Text><Text style={styles.body}>Amount: {formatUnits(review.amount, 18)} {review.assetId === 'native-bnb' ? 'BNB' : review.assetId.toUpperCase()}</Text><Text style={styles.body}>Maximum fee: {formatUnits(review.gas * review.gasPrice, 18)} BNB</Text><Text style={styles.body}>{expired ? 'Review expired. Refresh the replacement fee.' : 'Android will confirm these details and ask for your fingerprint.'}</Text><Pressable disabled={busy || isLocked || expired || transfers.refreshing} style={styles.button} onPress={() => void submitReplacement()}><Text style={styles.buttonText}>{label} with biometrics</Text></Pressable></View> : null}
    {busy ? <ActivityIndicator color="#87c3ff" /> : null}
    {message ? <Text accessibilityRole="alert" style={styles.body}>{message}</Text> : null}
    <Pressable disabled={busy || transfers.refreshing || isLocked} style={styles.button} onPress={() => transfers.refresh()}><Text style={styles.buttonText}>Check status</Text></Pressable>
    {candidates.map(candidate => <MainnetTransferRecoveryCard key={candidate.transactionHash} record={candidate} refreshing={transfers.refreshing} onRefresh={transfers.refresh} />)}
    {original ? <MainnetTransferRecoveryCard record={original} refreshing={transfers.refreshing} onRefresh={transfers.refresh} /> : null}
    <MainnetSupportReportButton sender={sender} disabled={busy || transfers.refreshing || isLocked} />
    <Pressable disabled={busy} style={styles.button} onPress={() => router.replace('/wallet/mainnet-readonly' as never)}><Text style={styles.buttonText}>Return to wallet</Text></Pressable>
  </ScrollView></SafeAreaView>;
}
const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: '#04091b' }, content: { padding: 24, paddingBottom: 96 },
  title: { color: '#f8fbff', fontSize: 27, fontWeight: '900', marginTop: 18 }, body: { color: '#bfd3ef', fontSize: 14, lineHeight: 22, marginTop: 10 },
  card: { backgroundColor: '#0c1c3d', borderColor: '#3d83e5', borderWidth: 1, borderRadius: 16, padding: 16, marginTop: 18 },
  button: { minHeight: 52, justifyContent: 'center', alignItems: 'center', backgroundColor: '#397ff0', borderRadius: 12, marginTop: 18 }, buttonText: { color: '#fff', fontWeight: '900', fontSize: 14 } });
