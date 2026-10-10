import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { NETWORK, SIGNING_FEATURE, WALLET_SECRET_FEATURE } from '@/config/network';
import { NetworkSelectorCard } from '@/components/network-selector-card';
import { TestnetTransferStatusCard } from '@/components/testnet-transfer-status-card';
import { evaluateTestnetFeeReadiness, type TestnetFeeReadiness } from '@/security/testnet-fee-readiness';
import { validateTestnetTransactionReview, type TransactionIntentResult } from '@/security/transaction-intent-policy';
import { useTestnetSendFlow } from '@/security/testnet-send-flow-provider';
import { normalizeAddress } from '@/utils/address';

type AssetId = 'native-bnb' | 'arxi' | 'usdt';
const REVIEW_ASSETS: readonly { id: AssetId; label: string }[] = [
  { id: 'native-bnb', label: 'tBNB' },
  { id: 'arxi', label: 'ARXI' },
  { id: 'usdt', label: 'USDT' },
];

export default function TransactionReviewScreen() {
  const router = useRouter();
  const { begin } = useTestnetSendFlow();
  const { bnbBalanceWei, gasPriceWei, walletAddress } = useLocalSearchParams<{ bnbBalanceWei?: string; gasPriceWei?: string; walletAddress?: string }>();
  const [assetId, setAssetId] = useState<AssetId>('arxi');
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const review = useMemo(() => validateTestnetTransactionReview({
    chainId: NETWORK.chainId,
    chainIsTestnet: NETWORK.chain.testnet === true,
    assetId,
    recipient,
    amount,
  }), [amount, assetId, recipient]);
  const feeReadiness = useMemo<TestnetFeeReadiness | undefined>(() => {
    if (!submitted || !review.ok) return undefined;
    return evaluateTestnetFeeReadiness({
      intent: review.intent,
      nativeBalanceWei: parsePublicWei(bnbBalanceWei),
      gasPriceWei: parsePublicWei(gasPriceWei),
    });
  }, [bnbBalanceWei, gasPriceWei, review, submitted]);
  const sender = useMemo(() => normalizeAddress(typeof walletAddress === 'string' ? walletAddress : ''), [walletAddress]);
  const canEnterConfirmation = SIGNING_FEATURE.enabled
    && submitted
    && review.ok
    && feeReadiness?.state === 'ready'
    && sender.ok;
  const confirmationLabel = !submitted
    ? 'Review transfer to continue'
    : !review.ok
      ? 'Fix transfer details'
      : !SIGNING_FEATURE.enabled
        ? 'Signing unavailable'
        : feeReadiness?.state !== 'ready'
          ? 'Network readiness required'
          : !sender.ok
            ? 'Wallet identity unavailable'
            : 'Continue to secure confirmation';

  function continueToSecureConfirmation() {
    if (!canEnterConfirmation || !review.ok || feeReadiness?.state !== 'ready' || !sender.ok) return;
    begin({
      expectedAddress: sender.address,
      gasPriceWei: feeReadiness.gasPriceWei,
      intent: review.intent,
      nativeBalanceWei: parsePublicWei(bnbBalanceWei) ?? 0n,
    });
    router.push('/wallet/transaction-confirm' as never);
  }

  if (!WALLET_SECRET_FEATURE.enabled) return <Redirect href="/" />;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <Text style={styles.eyebrow}>TRANSFER REVIEW</Text>
        <Text style={styles.title}>Prepare a transfer</Text>
        <Text style={styles.body}>
          Enter a recipient and amount to review the transfer. No signing or broadcast occurs on this screen; a fresh PIN confirmation and separate broadcast confirmation are required later.
        </Text>
        <NetworkSelectorCard compact />
        <View accessibilityLabel="Transfer steps: Details, Review, Secure confirmation, Broadcast" style={styles.steps}>
          <Text style={styles.stepActive}>1 Details</Text>
          <Text style={styles.step}>2 Review</Text>
          <Text style={styles.step}>3 Confirm</Text>
          <Text style={styles.step}>4 Broadcast</Text>
        </View>

        <Text style={styles.inputLabel}>ASSET</Text>
        <View style={styles.assetRow}>
          {REVIEW_ASSETS.map((asset) => (
            <Pressable
              key={asset.id}
              accessibilityRole="button"
              accessibilityState={{ selected: asset.id === assetId }}
              accessibilityHint={`Select ${asset.label} for this transfer`}
              onPress={() => { setAssetId(asset.id); setSubmitted(false); }}
              style={[styles.assetButton, asset.id === assetId && styles.assetButtonSelected]}>
              <Text style={[styles.assetText, asset.id === assetId && styles.assetTextSelected]}>{asset.label}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.inputLabel}>RECIPIENT</Text>
        <TextInput
          accessibilityLabel="Recipient address"
          accessibilityHint="Enter a public 0x wallet address. Never enter a recovery phrase or private key."
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="0x…"
          placeholderTextColor="#61766d"
          style={styles.input}
          value={recipient}
          onChangeText={(value) => { setRecipient(value); setSubmitted(false); }}
        />
        <Text style={styles.inputHelper}>Use a public 0x address on the selected network. Never enter a recovery phrase or private key.</Text>
        <Text style={styles.inputLabel}>AMOUNT</Text>
        <TextInput
          accessibilityLabel="Transfer amount"
          accessibilityHint="Enter the amount to send."
          keyboardType="decimal-pad"
          placeholder="0.00"
          placeholderTextColor="#61766d"
          style={styles.input}
          value={amount}
          onChangeText={(value) => { setAmount(value); setSubmitted(false); }}
        />
        <Pressable accessibilityRole="button" onPress={() => setSubmitted(true)} style={({ pressed }) => [styles.reviewButton, pressed && styles.pressed]}>
          <Text style={styles.reviewButtonText}>Review transfer</Text>
        </Pressable>
        {submitted && !review.ok ? <View accessibilityLiveRegion="polite" accessibilityRole="alert" style={styles.errorCard}><Text style={styles.error}>{reviewErrorMessage(review.reason)}</Text></View> : null}

        {submitted && review.ok ? <View accessibilityLabel="Transfer review summary" style={styles.card}>
          <View style={styles.summaryHeader}>
            <Text style={styles.summaryLabel}>REVIEW SUMMARY</Text>
            <Text style={styles.summaryHint}>Check every detail</Text>
          </View>
          <Detail label="Network" value="BNB Smart Chain · 97" />
          <Detail label="Asset" value={`${review.intent.asset.name} (${review.intent.asset.symbol})`} />
          <Detail label="Amount" value={`${amount.trim()} ${review.intent.asset.symbol}`} />
          <Detail label="Recipient address" value={review.intent.recipient} />
          <Detail label="Asset contract" value={review.intent.asset.address ?? 'Native tBNB'} />
        </View> : null}

        {submitted && review.ok ? <TestnetTransferStatusCard /> : null}
        {feeReadiness ? <FeeReadinessCard readiness={feeReadiness} /> : null}

        <View accessibilityRole="alert" style={styles.notice}>
          <Text style={styles.noticeTitle}>{SIGNING_FEATURE.enabled ? 'Secure confirmation required' : 'Signing disabled'}</Text>
          <Text style={styles.noticeBody}>
            {SIGNING_FEATURE.enabled
              ? 'A fresh PIN confirmation is required before any local signature can be prepared. Broadcast remains separately gated.'
              : 'No PIN, biometric check, key access, RPC request, transaction signing, or broadcast occurs on this screen.'}
          </Text>
        </View>

        <Pressable
          accessibilityHint={canEnterConfirmation ? 'Opens the fresh PIN confirmation step' : 'Complete the required transfer review before continuing'}
          accessibilityLabel={confirmationLabel}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canEnterConfirmation }}
          disabled={!canEnterConfirmation}
          onPress={continueToSecureConfirmation}
          style={[styles.disabledButton, canEnterConfirmation && styles.confirmButton]}>
          <Text style={[styles.disabledButtonText, canEnterConfirmation && styles.confirmButtonText]}>{confirmationLabel}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.back()}
          style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>
          <Text style={styles.secondaryButtonText}>Return to wallet</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  const isAddress = /^0x[a-fA-F0-9]{40}$/.test(value);
  return (
    <View style={styles.detail}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text selectable style={[styles.detailValue, isAddress && styles.detailAddress]}>{value}</Text>
    </View>
  );
}

function parsePublicWei(value: string | string[] | undefined): bigint | undefined {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return undefined;
  try {
    return BigInt(value);
  } catch {
    return undefined;
  }
}

function reviewErrorMessage(reason: Exclude<TransactionIntentResult, { ok: true }>['reason']): string {
  switch (reason) {
    case 'invalid-recipient':
      return 'Enter a valid 0x recipient address for the selected network.';
    case 'invalid-amount':
      return 'Enter an amount greater than zero using only numbers and a decimal point.';
    case 'asset-not-allowlisted':
      return 'This asset is not supported by the selected network.';
    case 'mainnet-blocked':
      return 'Mainnet transfers are not available in this build.';
    case 'testnet-not-allowlisted':
      return 'Only the currently selected network is supported in this preview.';
    case 'signing-disabled':
      return 'Signing is unavailable in this build.';
  }
}

function FeeReadinessCard({ readiness }: { readiness: TestnetFeeReadiness }) {
  const isReady = readiness.state === 'ready';
  const isUnavailable = readiness.state === 'unavailable';
  const title = isReady
    ? 'Estimated network fee'
    : isUnavailable
      ? 'Network fee unavailable'
      : 'Insufficient tBNB for network fee';
  const body = isReady
    ? `${readiness.feeLabel} · tBNB reserve verified from the latest public balance snapshot.`
    : isUnavailable
      ? readiness.message
      : `This transfer requires a tBNB network fee of about ${readiness.feeLabel}. Add tBNB, refresh balances, and review again.`;
  return (
    <View accessibilityRole={isReady ? undefined : 'alert'} style={[styles.feeCard, !isReady && styles.feeCardWarning]}>
      <Text style={styles.feeLabel}>NETWORK FEE</Text>
      <Text style={styles.feeTitle}>{title}</Text>
      <Text style={styles.feeBody}>{body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#071310' },
  content: { padding: 24, paddingBottom: 48 },
  eyebrow: { color: '#7cf6bd', fontSize: 12, fontWeight: '800', letterSpacing: 1.8 },
  title: { color: '#f6fbf8', fontSize: 31, fontWeight: '800', marginTop: 12 },
  body: { color: '#9eb2a9', fontSize: 15, lineHeight: 23, marginTop: 12 },
  steps: { backgroundColor: '#0c1c17', borderColor: '#1b352c', borderRadius: 14, borderWidth: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 18, padding: 11 },
  step: { color: '#82978e', fontSize: 11, fontWeight: '700' },
  stepActive: { color: '#7cf6bd', fontSize: 11, fontWeight: '900' },
  inputLabel: { color: '#7cf6bd', fontSize: 11, fontWeight: '800', letterSpacing: 1.1, marginTop: 22 },
  assetRow: { flexDirection: 'row', gap: 8, marginTop: 9 },
  assetButton: { borderColor: '#315046', borderRadius: 12, borderWidth: 1, flex: 1, minHeight: 48, justifyContent: 'center', paddingVertical: 12 },
  assetButtonSelected: { backgroundColor: '#153c30', borderColor: '#7cf6bd' },
  assetText: { color: '#9eb2a9', fontSize: 14, fontWeight: '800', textAlign: 'center' },
  assetTextSelected: { color: '#7cf6bd' },
  input: { borderColor: '#315046', borderRadius: 12, borderWidth: 1, color: '#e5f5ed', fontSize: 15, marginTop: 9, paddingHorizontal: 14, paddingVertical: 13 },
  inputHelper: { color: '#81968d', fontSize: 12, lineHeight: 18, marginTop: 7 },
  reviewButton: { alignItems: 'center', backgroundColor: '#7cf6bd', borderRadius: 14, marginTop: 24, paddingVertical: 15 },
  reviewButtonText: { color: '#092018', fontSize: 15, fontWeight: '800' },
  errorCard: { backgroundColor: '#251513', borderColor: '#6c3c37', borderRadius: 12, borderWidth: 1, marginTop: 12, padding: 12 },
  error: { color: '#ffb2a8', fontSize: 13, lineHeight: 20 },
  card: { backgroundColor: '#0c1c17', borderColor: '#3b6e5a', borderRadius: 18, borderWidth: 1, marginTop: 26, padding: 18 },
  summaryHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingBottom: 5 },
  summaryLabel: { color: '#7cf6bd', fontSize: 11, fontWeight: '900', letterSpacing: 1.25 },
  summaryHint: { color: '#9eb2a9', fontSize: 12, fontWeight: '700' },
  detail: { borderBottomColor: '#1d3b30', borderBottomWidth: 1, paddingVertical: 13 },
  detailLabel: { color: '#7cf6bd', fontSize: 11, fontWeight: '800', letterSpacing: 1.1 },
  detailValue: { color: '#e5f5ed', flexShrink: 1, fontSize: 14, lineHeight: 21, marginTop: 5 },
  detailAddress: { fontFamily: 'monospace', fontSize: 12, letterSpacing: 0.12, lineHeight: 20 },
  notice: { backgroundColor: '#251513', borderColor: '#6c3c37', borderRadius: 16, borderWidth: 1, marginTop: 18, padding: 16 },
  noticeTitle: { color: '#ffd3cc', fontSize: 14, fontWeight: '800' },
  noticeBody: { color: '#e9aaa1', fontSize: 13, lineHeight: 20, marginTop: 6 },
  feeCard: { backgroundColor: '#0c1c17', borderColor: '#1b5f43', borderRadius: 16, borderWidth: 1, marginTop: 18, padding: 16 },
  feeCardWarning: { backgroundColor: '#251513', borderColor: '#6c3c37' },
  feeLabel: { color: '#7cf6bd', fontSize: 11, fontWeight: '800', letterSpacing: 1.1 },
  feeTitle: { color: '#e5f5ed', fontSize: 15, fontWeight: '800', marginTop: 7 },
  feeBody: { color: '#a8bbb2', fontSize: 13, lineHeight: 20, marginTop: 6 },
  disabledButton: { alignItems: 'center', backgroundColor: '#31443c', borderRadius: 14, marginTop: 22, opacity: 0.6, paddingVertical: 15 },
  disabledButtonText: { color: '#b7c8c0', fontSize: 15, fontWeight: '800' },
  confirmButton: { backgroundColor: '#7cf6bd', opacity: 1 },
  confirmButtonText: { color: '#062015' },
  secondaryButton: { alignItems: 'center', borderColor: '#7cf6bd', borderRadius: 14, borderWidth: 1, marginTop: 12, paddingVertical: 15 },
  secondaryButtonText: { color: '#7cf6bd', fontSize: 15, fontWeight: '800' },
  pressed: { opacity: 0.78 },
});
