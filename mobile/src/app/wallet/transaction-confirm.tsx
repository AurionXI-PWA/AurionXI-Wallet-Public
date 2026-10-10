import { Redirect, useRouter } from 'expo-router';
import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { formatUnits, keccak256, type Hex } from 'viem';

import { SIGNING_FEATURE, WALLET_SECRET_FEATURE } from '@/config/network';
import { createTestnetSigningEnvelope } from '@/security/testnet-signing-envelope';
import { createExplicitTestnetBroadcastApproval, type TestnetBroadcastGateResult } from '@/security/testnet-broadcast-gate';
import { executeApprovedTestnetBroadcast } from '@/security/testnet-execution-coordinator';
import { prepareTestnetSendController } from '@/security/testnet-send-controller';
import { evaluateTestnetFeeReadiness } from '@/security/testnet-fee-readiness';
import { validatePin } from '@/security/pin-policy';
import { signTestnetEnvelopeWithFreshPin } from '@/security/testnet-native-signing-operation';
import {
  INITIAL_TESTNET_TRANSACTION_STATUS,
  transitionTestnetTransactionStatus,
} from '@/security/testnet-transaction-status';
import type { PinConfirmedSigningSession } from '@/security/pin-confirmed-signing-session';
import { useTestnetSendFlow } from '@/security/testnet-send-flow-provider';
import { useSessionLock } from '@/security/session-lock-provider';
import { useSensitiveScreenProtection } from '@/security/use-sensitive-screen-protection';
import { TestnetTransferStatusCard } from '@/components/testnet-transfer-status-card';
import { fetchTestnetTransactionSnapshot, testnetReceiptPollClient, type TestnetTransactionSnapshot } from '@/services/testnet-transaction-snapshot';
import { createTestnetRelayBroadcaster, getTestnetBroadcastServiceUrl } from '@/services/testnet-firebase-broadcaster';
import { pollTestnetTransactionReceipt } from '@/services/testnet-receipt-poller';
import { recordPublicNativeSend } from '@/storage/public-native-activity-journal';

/**
 * This screen refreshes public Testnet metadata and performs an explicit PIN
 * confirmation. A user-approved PIN may prepare one local signature. A later,
 * separate, short-lived confirmation is required before the Testnet relay can run.
 */
export default function TransactionConfirmScreen() {
  useSensitiveScreenProtection();
  const router = useRouter();
  const { reset, state } = useTestnetSendFlow();
  const { isLocked } = useSessionLock();
  const draft = state.stage === 'reviewed' ? state.draft : null;
  const [snapshot, setSnapshot] = useState<TestnetTransactionSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pin, setPin] = useState('');
  const [pinBusy, setPinBusy] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinConfirmedAt, setPinConfirmedAt] = useState<number | null>(null);
  const [signedTransaction, setSignedTransaction] = useState<Hex | null>(null);
  const [broadcastSession, setBroadcastSession] = useState<PinConfirmedSigningSession | null>(null);
  const [broadcastBusy, setBroadcastBusy] = useState(false);
  const [receiptRefreshBusy, setReceiptRefreshBusy] = useState(false);
  const [status, dispatchStatus] = useReducer(transitionTestnetTransactionStatus, INITIAL_TESTNET_TRANSACTION_STATUS);
  const pinSubmitInFlight = useRef(false);
  const broadcastSubmitInFlight = useRef(false);

  useEffect(() => {
    if (!SIGNING_FEATURE.enabled || !draft) return;
    let current = true;
    // Reset the review snapshot before starting its replacement network read.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);
    void fetchTestnetTransactionSnapshot(draft.expectedAddress, draft.intent.asset)
      .then((next) => { if (current) setSnapshot(next); })
      .catch(() => { if (current) setError('Public network data is unavailable. Return, refresh balances, and review again.'); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [draft]);

  const fee = useMemo(() => {
    if (!draft || !snapshot) return null;
    return evaluateTestnetFeeReadiness({
      intent: draft.intent,
      nativeBalanceWei: snapshot.nativeBalanceWei,
      gasPriceWei: snapshot.gasPriceWei,
      assetBalanceWei: snapshot.assetBalanceWei,
    });
  }, [draft, snapshot]);

  const canConfirmPin = !isLocked && !loading && !pinBusy && snapshot !== null && fee?.state === 'ready' && pin.length === 6;

  async function confirmPin() {
    if (!canConfirmPin || pinSubmitInFlight.current) return;
    pinSubmitInFlight.current = true;
    setPinError(null);
    const validation = validatePin(pin);
    if (!validation.ok) {
      setPinError(validation.message);
      pinSubmitInFlight.current = false;
      return;
    }
    setPinBusy(true);
    try {
      if (!draft || !snapshot || fee?.state !== 'ready') return;
      const now = Date.now();
      const prepared = prepareTestnetSendController({
        review: {
          chainId: 97,
          chainIsTestnet: true,
          signingEnabled: SIGNING_FEATURE.enabled,
          assetId: draft.intent.asset.id,
          recipient: draft.intent.recipient,
          amount: formatUnits(draft.intent.amount, draft.intent.asset.decimals),
        },
        vaultUnlocked: !isLocked,
        walletSecretsEnabled: WALLET_SECRET_FEATURE.enabled,
        reviewConfirmed: true,
        nativeBalanceWei: snapshot.nativeBalanceWei,
        gasPriceWei: snapshot.gasPriceWei,
        pinVerifiedAt: now,
        rpcConfigured: getTestnetBroadcastServiceUrl() !== undefined,
        now,
      });
      if (!prepared.ok) {
        setPinError('The reviewed transfer is no longer valid. Return and review it again.');
        return;
      }
      const envelope = createTestnetSigningEnvelope({ transfer: prepared.transfer, snapshot, fee });
      const serialized = await signTestnetEnvelopeWithFreshPin({
        envelope,
        expectedAddress: draft.expectedAddress,
        now,
        pin,
        session: prepared.session,
      });
      setPin('');
      setPinConfirmedAt(now);
      setSignedTransaction(serialized);
      setBroadcastSession(prepared.session);
      dispatchStatus({ type: 'SIGNED', hash: keccak256(serialized), now });
    } catch {
      setPin('');
      setPinError('PIN verification or local signing failed. Nothing was broadcast.');
    } finally {
      pinSubmitInFlight.current = false;
      setPinBusy(false);
    }
  }

  async function broadcastSignedTransaction() {
    if (!signedTransaction || !broadcastSession || broadcastBusy || broadcastSubmitInFlight.current) return;
    broadcastSubmitInFlight.current = true;
    // This timestamp is captured only after the user's explicit broadcast action.
    // eslint-disable-next-line react-hooks/purity
    const now = Date.now();
    const approval = createExplicitTestnetBroadcastApproval({ userConfirmed: true, now });
    setBroadcastBusy(true);
    setPinError(null);
    try {
      const result = await executeApprovedTestnetBroadcast({
        chainId: 97,
        chainIsTestnet: true,
        rpcConfigured: getTestnetBroadcastServiceUrl() !== undefined,
        session: broadcastSession,
        approval,
        expectedHash: keccak256(signedTransaction),
        serializedTransaction: signedTransaction,
        now,
        broadcaster: createTestnetRelayBroadcaster(),
        receiptReader: testnetReceiptPollClient,
      });
      if (result.state === 'blocked') {
        dispatchStatus({ type: 'FAILED', reason: 'broadcast-rejected', retryAllowed: false });
        setPinError(presentBroadcastGateMessage(result.gate));
        return;
      }
      dispatchStatus({ type: 'SUBMITTED', hash: result.hash, now });
      if (result.receipt.state === 'pending') {
        // Receipt time is observed after the asynchronous relay response.
        // eslint-disable-next-line react-hooks/purity
        dispatchStatus({ type: 'PENDING', now: Date.now() });
      } else if (result.receipt.state === 'confirmed') {
        // Receipt time is observed after the asynchronous relay response.
        // eslint-disable-next-line react-hooks/purity
        dispatchStatus({ type: 'CONFIRMED', blockNumber: result.receipt.blockNumber, now: Date.now() });
        await recordConfirmedNativeSend(result.hash, result.receipt.blockNumber).catch(() => undefined);
      } else if (result.receipt.state === 'reverted') {
        dispatchStatus({ type: 'FAILED', reason: 'receipt-reverted', retryAllowed: false });
      } else {
        // A broadcast hash exists, so only receipt polling may be retried. Never
        // re-broadcast this signed payload from a temporary receipt outage.
        dispatchStatus({ type: 'FAILED', reason: 'status-unavailable', retryAllowed: true });
      }
    } catch {
      dispatchStatus({ type: 'FAILED', reason: 'broadcast-rejected', retryAllowed: true });
      setPinError('The network relay did not accept this transaction. Nothing was confirmed.');
    } finally {
      broadcastSubmitInFlight.current = false;
      setBroadcastBusy(false);
    }
  }

  async function refreshReceiptStatus() {
    if (receiptRefreshBusy || (status.stage !== 'submitted' && status.stage !== 'pending' && !(status.stage === 'failed' && status.reason === 'status-unavailable' && status.retryAllowed))) return;
    const hash = status.hash;
    if (!hash) return;
    setReceiptRefreshBusy(true);
    try {
      const receipt = await pollTestnetTransactionReceipt(testnetReceiptPollClient, hash);
      if (receipt.state === 'pending') {
        dispatchStatus({ type: 'PENDING', now: Date.now() });
      } else if (receipt.state === 'confirmed') {
        dispatchStatus({ type: 'CONFIRMED', blockNumber: receipt.blockNumber, now: Date.now() });
        await recordConfirmedNativeSend(hash, receipt.blockNumber).catch(() => undefined);
      } else if (receipt.state === 'reverted') {
        dispatchStatus({ type: 'FAILED', reason: 'receipt-reverted', retryAllowed: false });
      } else {
        dispatchStatus({ type: 'FAILED', reason: 'status-unavailable', retryAllowed: true });
      }
    } finally {
      setReceiptRefreshBusy(false);
    }
  }

  async function recordConfirmedNativeSend(hash: `0x${string}`, blockNumber: string) {
    if (!draft || draft.intent.asset.kind !== 'native') return;
    await recordPublicNativeSend({
      address: draft.expectedAddress,
      amount: formatUnits(draft.intent.amount, draft.intent.asset.decimals),
      blockNumber,
      hash,
      recipient: draft.intent.recipient,
      timestamp: new Date(),
    });
  }

  if (!SIGNING_FEATURE.enabled || !draft) return <Redirect href="/wallet" />;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <Text style={styles.eyebrow}>SECURE CONFIRMATION</Text>
        <Text style={styles.title}>Verify before you sign</Text>
        <Text style={styles.body}>Review the recipient, asset and network snapshot. A fresh PIN is required before one local signature can be prepared.</Text>
        <View style={styles.card}>
          <Detail label="ASSET" value={draft.intent.asset.symbol} />
          <Detail label="AMOUNT" value={`${formatUnits(draft.intent.amount, draft.intent.asset.decimals)} ${draft.intent.asset.symbol}`} />
          <Detail label="RECIPIENT ADDRESS" value={draft.intent.recipient} />
          <Detail label="NETWORK" value="BNB Smart Chain · 97" />
        </View>
        <View style={styles.snapshotCard}>
          <Text style={styles.label}>CURRENT NETWORK SNAPSHOT</Text>
          {loading ? <ActivityIndicator accessibilityLabel="Refreshing public network data" color="#7cf6bd" style={styles.spinner} /> : null}
          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
          {snapshot && fee?.state === 'ready' ? <>
            <Detail label="NEXT TRANSACTION NONCE" value={snapshot.nonce.toString()} />
            <Detail label="ESTIMATED NETWORK FEE" value={fee.feeLabel} />
            <Detail label="AVAILABLE NATIVE BNB" value={`${formatUnits(snapshot.nativeBalanceWei, 18)} tBNB`} />
            {draft.intent.asset.kind !== 'native' ? <Detail label={`CURRENT ${draft.intent.asset.symbol} BALANCE`} value={`${formatUnits(snapshot.assetBalanceWei, draft.intent.asset.decimals)} ${draft.intent.asset.symbol}`} /> : null}
          </> : null}
          {snapshot && fee?.state !== 'ready' ? <Text accessibilityRole="alert" style={styles.error}>{fee?.state === 'unavailable'
            ? fee.message
            : fee?.state === 'insufficient-asset-balance'
              ? `Current ${draft.intent.asset.symbol} balance is not sufficient for this transfer.`
              : 'Current tBNB balance is not sufficient for this transfer and its network fee.'}</Text> : null}
        </View>
        {snapshot && fee?.state === 'ready' ? <View style={styles.pinCard}>
          <Text style={styles.pinTitle}>Confirm your security PIN</Text>
          <Text style={styles.pinBody}>This verifies the encrypted local wallet again before the next signing stage. Your PIN is never saved in this screen.</Text>
          <TextInput
            accessibilityLabel="Confirm six-digit PIN for local signing"
            editable={!pinBusy && pinConfirmedAt === null}
            keyboardType="number-pad"
            maxLength={6}
            onChangeText={(value) => { setPin(value.replace(/\D/g, '')); setPinError(null); }}
            secureTextEntry
            style={styles.input}
            value={pin}
          />
          {pinError ? <Text accessibilityRole="alert" style={styles.error}>{pinError}</Text> : null}
          {signedTransaction !== null && pinConfirmedAt !== null ? <View accessibilityLiveRegion="polite" style={styles.signedCard}>
            <Text style={styles.success}>Signature ready</Text>
            <Text style={styles.signedBody}>This signature matches the reviewed transfer. Check its hash, then use the separate broadcast confirmation before the fresh PIN session expires.</Text>
            <View style={styles.hashPanel}>
              <Text style={styles.hashLabel}>SIGNATURE HASH</Text>
              <Text selectable style={styles.hash}>{keccak256(signedTransaction)}</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Broadcast signed transaction"
              disabled={broadcastBusy}
              onPress={() => void broadcastSignedTransaction()}
              style={[styles.broadcastButton, broadcastBusy && styles.pinButtonDisabled]}>
              {broadcastBusy ? <ActivityIndicator color="#062015" /> : <Text style={styles.pinButtonText}>Broadcast transaction</Text>}
            </Pressable>
          </View> : <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: !canConfirmPin }}
            disabled={!canConfirmPin}
            onPress={() => void confirmPin()}
            style={[styles.pinButton, !canConfirmPin && styles.pinButtonDisabled]}>
            {pinBusy ? <ActivityIndicator color="#062015" /> : <Text style={styles.pinButtonText}>Confirm PIN and prepare signature</Text>}
          </Pressable>}
        </View> : null}
        <TestnetTransferStatusCard status={status} refreshing={receiptRefreshBusy} onRefreshStatus={() => void refreshReceiptStatus()} />
        <View accessibilityRole="alert" style={styles.notice}>
          <Text style={styles.noticeTitle}>Separate broadcast confirmation required</Text>
          <Text style={styles.noticeBody}>Broadcast is available only after local signing. The approval is one-time, lasts 30 seconds, and is bound to this exact reviewed transaction hash.</Text>
        </View>
        <Pressable accessibilityRole="button" onPress={() => { reset(); router.replace('/wallet'); }} style={styles.button}>
          <Text style={styles.buttonText}>Return to wallet</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  const isAddress = /^0x[a-fA-F0-9]{40}$/.test(value);
  return <View style={styles.detail}><Text style={styles.label}>{label}</Text><Text selectable style={[styles.value, isAddress && styles.addressValue]}>{value}</Text></View>;
}

function presentBroadcastGateMessage(gate: Exclude<TestnetBroadcastGateResult, { ok: true }>): string {
  switch (gate.reason) {
    case 'pin-confirmation-expired':
      return 'Your PIN confirmation expired. No transaction was broadcast; return and review the transfer again.';
    case 'rpc-unavailable':
      return 'The network relay is unavailable. No transaction was submitted; review the transfer again later.';
    case 'explicit-approval-required':
      return 'The broadcast confirmation expired. No transaction was submitted; review the transfer again.';
    case 'signed-payload-mismatch':
      return 'The signed transaction no longer matches the reviewed transfer. Nothing was broadcast.';
    case 'mainnet-blocked':
      return 'Mainnet broadcasting is blocked in this Testnet build.';
  }
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#071310' },
  content: { flexGrow: 1, padding: 24, paddingVertical: 32 },
  eyebrow: { color: '#7cf6bd', fontSize: 11, fontWeight: '800', letterSpacing: 1.5 },
  title: { color: '#f6fbf8', fontSize: 30, fontWeight: '800', marginTop: 10 },
  body: { color: '#9eb2a9', fontSize: 15, lineHeight: 23, marginTop: 12 },
  card: { backgroundColor: '#0c1c17', borderColor: '#3b6e5a', borderRadius: 16, borderWidth: 1, marginTop: 24, padding: 16 },
  snapshotCard: { backgroundColor: '#0c1c17', borderColor: '#1b5f43', borderRadius: 16, borderWidth: 1, marginTop: 14, padding: 16 },
  detail: { borderBottomColor: '#1d3b30', borderBottomWidth: 1, paddingVertical: 9 },
  label: { color: '#7cf6bd', fontSize: 11, fontWeight: '800', letterSpacing: 1.1, marginTop: 2 },
  value: { color: '#e5f5ed', flexShrink: 1, fontSize: 14, lineHeight: 21, marginTop: 5 },
  addressValue: { fontFamily: 'monospace', fontSize: 12, letterSpacing: 0.12, lineHeight: 20 },
  spinner: { marginTop: 16 },
  error: { color: '#ffb2a8', fontSize: 13, lineHeight: 20, marginTop: 12 },
  pinCard: { backgroundColor: '#0c1c17', borderColor: '#1b5f43', borderRadius: 16, borderWidth: 1, marginTop: 16, padding: 16 },
  pinTitle: { color: '#e5f5ed', fontSize: 16, fontWeight: '800' },
  pinBody: { color: '#a8bbb2', fontSize: 13, lineHeight: 20, marginTop: 6 },
  input: { borderColor: '#315046', borderRadius: 12, borderWidth: 1, color: '#e5f5ed', fontSize: 18, letterSpacing: 5, marginTop: 14, paddingHorizontal: 14, paddingVertical: 12, textAlign: 'center' },
  pinButton: { alignItems: 'center', backgroundColor: '#7cf6bd', borderRadius: 13, marginTop: 14, minHeight: 49, justifyContent: 'center', paddingVertical: 13 },
  pinButtonDisabled: { backgroundColor: '#31443c', opacity: 0.6 },
  pinButtonText: { color: '#062015', fontSize: 15, fontWeight: '800' },
  success: { color: '#7cf6bd', fontSize: 13, fontWeight: '700', lineHeight: 20, marginTop: 14 },
  signedCard: { backgroundColor: '#10261e', borderColor: '#3f8f69', borderRadius: 12, borderWidth: 1, marginTop: 14, padding: 13 },
  signedBody: { color: '#b7d8c7', fontSize: 12, lineHeight: 18, marginTop: 6 },
  hashPanel: { backgroundColor: '#071310', borderColor: '#315046', borderRadius: 10, borderWidth: 1, marginTop: 12, minHeight: 82, padding: 11 },
  hashLabel: { color: '#9eb2a9', fontSize: 10, fontWeight: '900', letterSpacing: 1.1 },
  hash: { color: '#e5f5ed', flexShrink: 1, fontFamily: 'monospace', fontSize: 11, letterSpacing: 0.12, lineHeight: 19, marginTop: 7 },
  broadcastButton: { alignItems: 'center', backgroundColor: '#7cf6bd', borderRadius: 13, marginTop: 14, minHeight: 49, justifyContent: 'center', paddingVertical: 13 },
  notice: { backgroundColor: '#251513', borderColor: '#6c3c37', borderRadius: 16, borderWidth: 1, marginTop: 16, padding: 16 },
  noticeTitle: { color: '#ffd3cc', fontSize: 14, fontWeight: '800' },
  noticeBody: { color: '#e9aaa1', fontSize: 13, lineHeight: 20, marginTop: 6 },
  button: { alignItems: 'center', borderColor: '#7cf6bd', borderRadius: 14, borderWidth: 1, marginTop: 24, paddingVertical: 15 },
  buttonText: { color: '#7cf6bd', fontSize: 15, fontWeight: '800' },
});
