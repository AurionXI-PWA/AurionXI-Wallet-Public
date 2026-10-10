import { Redirect, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { formatUnits } from 'viem';

import { useMainnetSendFlow } from '@/security/mainnet-send-flow-provider';
import { useMainnetSessionLock } from '@/security/mainnet-session-lock-provider';
import { useSensitiveScreenProtection } from '@/security/use-sensitive-screen-protection';
import type { MainnetSubmissionRecord } from '@/storage/mainnet-submission-journal';
import { getMainnetRecoveryDiagnosticsNatively, reconcileMainnetReceiptNatively } from '@/security/mainnet-native-signer';
import { canCheckMainnetRecoveryReceipt, type MainnetRecoveryDiagnostics, type MainnetRecoveryRecord } from '@/security/mainnet-native-recovery-diagnostics';
import { getNativeMainnetVaultMigrationStatus } from '@/security/mainnet-native-vault-migration';
import { useMainnetTransfers } from '@/hooks/use-mainnet-transfers';
import { MainnetTransferRecoveryCard } from '@/components/mainnet-transfer-recovery-card';
import { invalidateNativeMainnetAuthorizations } from '@/security/mainnet-native-authorization-boundary';

/** One trusted native Send consent; JavaScript receives public outcome metadata only. */
export default function MainnetSecureConfirmScreen() {
  useSensitiveScreenProtection();
  const router = useRouter();
  const { review, clear, productionCoordinator } = useMainnetSendFlow();
  const { isLocked, authorizationEpoch, isAuthorizationActive, recordActivity } = useMainnetSessionLock();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();
  const [submittedRecord, setSubmittedRecord] = useState<MainnetSubmissionRecord>();
  const [recovery, setRecovery] = useState<MainnetRecoveryDiagnostics>();
  const [requiresFreshReview, setRequiresFreshReview] = useState(false);
  const [vaultState, setVaultState] = useState<'checking' | 'ready' | 'migration' | 'unavailable'>('checking');
  const [showRecovery, setShowRecovery] = useState(false);
  const [now, setNow] = useState(Date.now());
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const sender = review?.review.senderAddress;
  const transfers = useMainnetTransfers(sender, Boolean(submittedRecord) && !busy && !isLocked);
  const displayedRecord = transfers.records.find((record) => record.transactionHash.toLowerCase() === submittedRecord?.transactionHash.toLowerCase()) ?? submittedRecord;
  const expiresAt = (review?.review.observedAt ?? 0) + 90_000;
  const expired = now >= expiresAt;

  useEffect(() => {
    mounted.current = true;
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => { mounted.current = false; clearInterval(timer); productionCoordinator.invalidate(); void invalidateNativeMainnetAuthorizations(); };
  }, [productionCoordinator]);
  useFocusEffect(useCallback(() => {
    let current = true;
    setVaultState('checking');
    const timeout = setTimeout(() => { if (current) setVaultState('unavailable'); current = false; }, 3_000);
    void getNativeMainnetVaultMigrationStatus().then((status) => {
      if (current) setVaultState(status.present && status.address?.toLowerCase() === sender?.toLowerCase() ? 'ready' : 'migration');
    }).catch(() => { if (current) setVaultState('unavailable'); }).finally(() => clearTimeout(timeout));
    return () => { current = false; clearTimeout(timeout); };
  }, [sender]));

  if (!review) return <Redirect href={'/wallet/mainnet-readonly' as never} />;

  async function inspectRecovery() {
    if (!review || inFlight.current || submittedRecord || isLocked) return;
    inFlight.current = true;
    setBusy(true); setMessage(undefined);
    try {
      const diagnostics = await getMainnetRecoveryDiagnosticsNatively(review.review);
      setRecovery(diagnostics); recordActivity();
      setMessage('Recovery status refreshed. This check did not sign or broadcast a transaction.');
    } catch { setMessage('Recovery status could not be read. Existing journal records remain unchanged.'); }
    finally { inFlight.current = false; if (mounted.current) setBusy(false); }
  }

  async function recoverPreviousReceipt(record: MainnetRecoveryRecord) {
    if (!review || inFlight.current || submittedRecord || isLocked || !canCheckMainnetRecoveryReceipt(record) || !record.transactionHash) return;
    const nonce = Number(record.nonce);
    if (!Number.isSafeInteger(nonce)) { setMessage('This nonce cannot be reconciled by this build. Its record remains unchanged.'); return; }
    inFlight.current = true; setBusy(true); setMessage(undefined);
    try {
      productionCoordinator.invalidate();
      const state = await reconcileMainnetReceiptNatively({ senderAddress: review.review.senderAddress, nonce, transactionHash: record.transactionHash });
      if (state === 'confirmed' || state === 'reverted' || state === 'not-submitted' || state === 'cancelled') setRequiresFreshReview(true);
      setMessage(state === 'pending' || state === 'unknown'
        ? 'Submission status is not final. The previous record remains protected. Check status again; do not send another transfer.'
        : `Previous transfer: ${state}. Create a fresh review before sending. Nothing was resubmitted by this status check.`);
      recordActivity();
      try { setRecovery(await getMainnetRecoveryDiagnosticsNatively(review.review)); }
      catch { setRecovery(undefined); }
    } catch { setMessage('Receipt verification is unavailable or did not match. The previous signed record remains unchanged; nothing was resubmitted.'); }
    finally { inFlight.current = false; if (mounted.current) setBusy(false); }
  }

  async function confirm() {
    if (!review || inFlight.current || submittedRecord) return;
    if (vaultState !== 'ready') { setMessage('Native vault preparation is required before sending. Your recovery vault will be retained.'); return; }
    if (Date.now() >= expiresAt) { setRequiresFreshReview(true); setMessage('This review expired. Create a fresh review with current fees.'); return; }
    if (requiresFreshReview) { setMessage('Receipt recovery completed. Return and create a fresh transfer review before signing.'); return; }
    if (busy || isLocked) { setMessage('The Mainnet wallet session is locked. Unlock it and review the transfer again.'); return; }
    const confirmationEpoch = authorizationEpoch;
    if (!isAuthorizationActive(confirmationEpoch)) { setMessage('The Mainnet wallet session is no longer active. Review the transfer again.'); return; }
    inFlight.current = true; recordActivity(); setBusy(true); setMessage(undefined);
    try {
      const result = await productionCoordinator.send({ review: review.review, authorizationEpoch: confirmationEpoch, userConfirmed: true, now: Date.now() });
      // Never discard a network outcome because the session changed while awaiting it.
      // Native durable history remains available when this screen is no longer mounted.
      if (!mounted.current) return;
      setSubmittedRecord(result.record);
      setMessage(result.state === 'submitted'
        ? 'Submitted once. Receipt status will refresh automatically. Do not send this transfer again.'
        : result.state === 'submission-unknown'
          ? 'Submission status unknown—check status. Do not sign or broadcast another copy.'
          : 'This attempt was not submitted. Create a fresh review before retrying.');
      if (!result.savedLocally) setMessage((previous) => `${previous} The display cache could not be saved; the native journal retains the transaction status.`);
    } catch (error: unknown) {
      if (mounted.current) { setMessage(presentSigningFailure(error)); setShowRecovery(true); }
    } finally { inFlight.current = false; if (mounted.current) setBusy(false); }
  }

  const asset = review.intent.asset;
  const recoveryBlocksSigning = requiresFreshReview || Boolean(recovery && (recovery.livePendingNonce !== recovery.reviewedNonce
    || !['clear', 'never_submitted_retry_available'].includes(recovery.reason)));
  return <SafeAreaView style={styles.safeArea}><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <Text style={styles.eyebrow}>BNB SMART CHAIN · MAINNET</Text><Text style={styles.title}>Review & send</Text>
    <Text style={styles.body}>Check these details. Android will show the trusted review and request your fingerprint before sending this exact transfer once.</Text>
    <View style={styles.card}><Detail label="NETWORK" value="BNB Smart Chain · Mainnet (56)" /><Detail label="FROM" value={review.review.senderAddress} /><Detail label="TO" value={review.review.recipient} /><Detail label="AMOUNT" value={`${formatUnits(review.intent.amount, asset.decimals)} ${asset.symbol}`} /><Detail label="MAXIMUM NETWORK FEE" value={review.fee.feeLabel} /></View>
    {vaultState !== 'ready' ? <View style={styles.notice}><Text style={styles.noticeTitle}>{vaultState === 'checking' ? 'Checking native vault…' : 'Prepare your native vault'}</Text><Text style={styles.noticeBody}>{vaultState === 'unavailable' ? 'Native vault status is unavailable. Return and review again; do not remove your wallet.' : 'One-time Android Keystore preparation keeps your wallet address and existing recovery vault.'}</Text>{vaultState === 'migration' ? <Pressable style={styles.secondary} onPress={() => router.push('/wallet/mainnet-native-vault-migration' as never)}><Text style={styles.secondaryText}>Prepare native vault</Text></Pressable> : null}</View> : null}
    {!submittedRecord ? <View style={styles.confirmCard}><Text style={styles.cardTitle}>Authorize this transfer</Text><Text style={styles.cardBody}>{expired ? 'Review expired. Create a fresh review before sending.' : `Review valid for ${Math.max(0, Math.ceil((expiresAt - now) / 1000))} seconds. Your private key stays in Android native code.`}</Text><Pressable accessibilityRole="button" disabled={busy || isLocked || expired || vaultState !== 'ready' || recoveryBlocksSigning} onPress={() => void confirm()} style={[styles.primary, (busy || isLocked || expired || vaultState !== 'ready' || recoveryBlocksSigning) && styles.disabled]}>{busy ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.primaryText}>Send with biometrics</Text>}</Pressable></View> : null}
    {displayedRecord ? <MainnetTransferRecoveryCard record={displayedRecord} refreshing={transfers.refreshing} onRefresh={transfers.refresh} /> : null}
    {transfers.unavailable ? <Text style={styles.cardBody}>Status temporarily unavailable. The native transaction record is retained. Do not send another copy.</Text> : null}
    {!submittedRecord ? <Pressable accessibilityRole="button" disabled={busy} style={styles.secondary} onPress={() => setShowRecovery(!showRecovery)}><Text style={styles.secondaryText}>{showRecovery ? 'Hide recovery details' : 'Previous transfer needs help?'}</Text></Pressable> : null}
    {showRecovery && !submittedRecord ? <View style={styles.confirmCard}>
      <Text style={styles.cardTitle}>Previous transaction recovery</Text>
      <Text style={styles.cardBody}>Read outstanding records before retrying. Previous signed transactions can be checked against their exact on-chain receipt.</Text>
      <Pressable accessibilityRole="button" disabled={busy || isLocked} onPress={() => void inspectRecovery()} style={[styles.secondary, (busy || isLocked) && styles.disabled]}><Text style={styles.secondaryText}>Check recovery status</Text></Pressable>
      {recovery ? <View>
        <Detail label="UNRESOLVED RECORDS" value={String(recovery.recordCount)} />
        <Detail label="REVIEWED NONCE / LIVE PENDING NONCE" value={`${recovery.reviewedNonce} / ${recovery.livePendingNonce ?? 'unavailable'}`} />
        <Text style={styles.cardBody}>{recoveryExplanation(recovery.reason)}</Text>
        {recovery.records.map((record) => <View key={`${record.nonce}:${record.replacesTransactionHash ?? 'original'}:${record.transactionHash ?? 'unsigned'}`} style={styles.detail}>
          <Text selectable style={styles.value}>{`Nonce ${record.nonce} · ${record.state}`}</Text>
          {record.transactionHash ? <Text selectable style={styles.value}>{record.transactionHash}</Text> : null}
          {record.state === 'SUBMITTED' && record.transactionHash && !record.replacesTransactionHash ? (['speed-up', 'cancel'] as const).map(kind => <Pressable key={kind} accessibilityRole="button" disabled={busy || isLocked} style={styles.secondary} onPress={() => router.push({ pathname: '/wallet/mainnet-replacement-review', params: { sender: review.review.senderAddress, nonce: record.nonce, hash: record.transactionHash, kind } } as never)}><Text style={styles.secondaryText}>{kind === 'cancel' ? 'Cancel' : 'Retry / Speed Up'} · nonce {record.nonce}</Text></Pressable>) : null}
          {canCheckMainnetRecoveryReceipt(record) ? <Pressable accessibilityRole="button" disabled={busy || isLocked} onPress={() => void recoverPreviousReceipt(record)} style={[styles.secondary, (busy || isLocked) && styles.disabled]}><Text style={styles.secondaryText}>Verify previous receipt · nonce {record.nonce}</Text></Pressable> : null}
        </View>)}
        {recovery.recordCount > recovery.records.length ? <Text style={styles.cardBody}>Showing the first {recovery.records.length} records. Refresh after receipt recovery to see remaining records.</Text> : null}
      </View> : null}
    </View> : null}
    {message ? <View accessibilityRole="alert" style={styles.notice}><Text style={styles.noticeTitle}>Confirmation result</Text><Text style={styles.noticeBody}>{message}</Text></View> : null}
    {!submittedRecord && !busy ? <Pressable accessibilityRole="button" onPress={() => router.dismissTo('/wallet/mainnet-send-review' as never)} style={styles.secondary}><Text style={styles.secondaryText}>Edit / refresh transfer review</Text></Pressable> : null}
    <Pressable accessibilityRole="button" onPress={() => { clear(); router.replace('/wallet/mainnet-readonly' as never); }} style={styles.back}><Text style={styles.backText}>{busy ? 'Cancel and return to portfolio' : 'Return to Mainnet portfolio'}</Text></Pressable>
  </ScrollView></SafeAreaView>;
}

function Detail({ label, value }: { label: string; value: string }) { return <View style={styles.detail}><Text style={styles.label}>{label}</Text><Text selectable style={styles.value}>{value}</Text></View>; }
function presentSigningFailure(error: unknown): string {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
  if (code === 'mainnet_native_signing_vault_unavailable') return 'The native Mainnet vault is unavailable. Complete the one-time Native vault migration in Settings, then review this transfer again.';
  if (code === 'mainnet_native_signing_expired') return 'The Mainnet review expired. Return and create a fresh transfer review.';
  if (code === 'mainnet_native_signing_not_released') return 'Native Mainnet signing rejected this transfer under the compiled production policy.';
  if (code === 'mainnet_native_signing_cancelled') return 'Authorization was cancelled. Check previous transfer status before starting another attempt.';
  if (code === 'mainnet_native_operation_busy' || code === 'mainnet_native_signing_busy') return 'A native transfer or status check is still completing. Wait briefly and check status; do not submit another copy.';
  if (code === 'mainnet_native_signing_nonce_recovery') {
    const detail = error && typeof error === 'object' && 'message' in error && typeof error.message === 'string' ? error.message : '';
    return `Previous nonce records need recovery. Use Check recovery status before retrying. No new transaction was signed.\n${detail}`;
  }
  const stage = code.startsWith('mainnet_native_signing_') ? code.slice('mainnet_native_signing_'.length) : 'unavailable';
  return `The transfer did not return a complete result (stage: ${stage}). Check previous transfer status before retrying; do not assume it was not submitted.`;
}
function recoveryExplanation(reason: MainnetRecoveryDiagnostics['reason']): string {
  switch (reason) {
    case 'clear': return 'No unresolved records.';
    case 'submitted_receipt_required': return 'Verify each previous submitted receipt below. Pending or unavailable receipts remain blocked.';
    case 'multiple_records': return 'Multiple unresolved records require review. No record was removed.';
    case 'nonce_mismatch': return 'A previous nonce differs from this transfer. If its hash is shown, verify its receipt below. No record was removed; missing or unavailable receipt evidence remains blocked.';
    case 'snapshot_unavailable': return 'Live pending nonce is unavailable. Refresh this status before proceeding.';
    case 'never_submitted_retry_available': return 'One never-submitted record matches the current nonce. A fresh biometric signing may recover it after native revalidation.';
  }
}
const styles = StyleSheet.create({ safeArea:{flex:1,backgroundColor:'#04091b'},content:{padding:24,paddingBottom:40},eyebrow:{color:'#73b7ff',fontSize:12,fontWeight:'900',letterSpacing:1.4,marginTop:16},title:{color:'#f8fbff',fontSize:30,fontWeight:'900',marginTop:9},body:{color:'#afc1df',fontSize:15,lineHeight:23,marginTop:10},card:{backgroundColor:'#0c1c3d',borderColor:'#3d83e5',borderRadius:16,borderWidth:1,marginTop:20,padding:16},detail:{borderBottomColor:'#264b85',borderBottomWidth:1,paddingVertical:10},label:{color:'#83bcff',fontSize:11,fontWeight:'900',letterSpacing:1.2},value:{color:'#f8fbff',fontFamily:'monospace',fontSize:13,lineHeight:20,marginTop:5},confirmCard:{backgroundColor:'#0c1c3d',borderColor:'#3d83e5',borderRadius:16,borderWidth:1,marginTop:16,padding:16},cardTitle:{color:'#e5f1ff',fontSize:16,fontWeight:'900'},cardBody:{color:'#afc1df',fontSize:13,lineHeight:20,marginTop:7},input:{backgroundColor:'#091a38',borderColor:'#477fcb',borderRadius:12,borderWidth:1,color:'#f8fbff',fontSize:18,letterSpacing:5,marginTop:14,padding:14,textAlign:'center'},primary:{alignItems:'center',backgroundColor:'#397ff0',borderRadius:14,justifyContent:'center',marginTop:14,minHeight:52},primaryText:{color:'#f8fbff',fontSize:15,fontWeight:'900'},secondary:{alignItems:'center',borderColor:'#609cf4',borderRadius:14,borderWidth:1,justifyContent:'center',marginTop:12,minHeight:52},secondaryText:{color:'#cfe5ff',fontSize:15,fontWeight:'900'},disabled:{opacity:.5},notice:{backgroundColor:'#0d284a',borderColor:'#4c96f2',borderRadius:16,borderWidth:1,marginTop:16,padding:16},noticeTitle:{color:'#e9f3ff',fontSize:14,fontWeight:'900'},noticeBody:{color:'#c3d8f4',fontSize:13,lineHeight:20,marginTop:7},back:{alignItems:'center',borderColor:'#609cf4',borderRadius:14,borderWidth:1,justifyContent:'center',marginTop:18,minHeight:52},backText:{color:'#cfe5ff',fontSize:15,fontWeight:'800'} });
