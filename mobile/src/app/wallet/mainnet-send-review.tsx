import { Redirect, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { prepareMainnetExecution, type MainnetExecutionPreparation } from '@/security/mainnet-execution-coordinator';
import { getMainnetSupportedAssets } from '@/security/mainnet-supported-assets-policy';
import { useMainnetSendFlow } from '@/security/mainnet-send-flow-provider';
import { isMainnetTrustedQuoteFresh } from '@/security/mainnet-trusted-quote';
import { fetchMainnetPortfolio } from '@/services/mainnet-portfolio';
import { MAINNET_DIRECT_PRODUCTION_POLICY, getMainnetSendAmountCap, isMainnetSendAssetId, type MainnetSendAssetId } from '@/security/mainnet-direct-production-policy';
import { useMainnetSessionLock } from '@/security/mainnet-session-lock-provider';

function parsePublicInteger(value: string | string[] | undefined): bigint | undefined {
  const candidate = typeof value === 'string' ? value : '';
  return /^\d+$/.test(candidate) ? BigInt(candidate) : undefined;
}

function messageFor(result: MainnetExecutionPreparation | undefined): string | undefined {
  if (!result) return undefined;
  switch (result.state) {
    case 'invalid-details': return 'Check the selected asset, recipient address, and amount.';
    case 'fee-unavailable': return 'A fresh Mainnet fee quote is required before this transfer can be reviewed.';
    case 'insufficient-native-balance': return 'The available BNB balance does not cover this transfer and its network fee.';
    case 'insufficient-asset-balance': return 'The selected asset balance is lower than the requested amount.';
    case 'review-ready': return 'Check the recipient, exact amount and maximum fee before authorizing this transfer.';
  }
}

/**
 * Transfer entry uses fresh public data. Native code remains the signing authority.
 */
export default function MainnetSendReviewScreen() {
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);
  const { quote, setQuote, setReview } = useMainnetSendFlow();
  const { authorizationEpoch, isAuthorizationActive, isLocked } = useMainnetSessionLock();
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string>();
  const reviewInFlight = useRef(false);
  const [assetId, setAssetId] = useState<MainnetSendAssetId>('native-bnb');
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [result, setResult] = useState<MainnetExecutionPreparation>();
  const assets = useMemo(() => getMainnetSupportedAssets().filter((support) => support.canPrepareSend).map(({ asset }) => asset), []);
  const selected = assets.find((asset) => asset.id === assetId);
  const quoteFresh = quote ? isMainnetTrustedQuoteFresh(quote) : false;

  useEffect(() => {
    if (!result) return;
    const frame = requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
    return () => cancelAnimationFrame(frame);
  }, [result]);

  async function review() {
    Keyboard.dismiss();
    if (!selected || !quote || reviewInFlight.current || !isAuthorizationActive(authorizationEpoch)) return;
    const requestEpoch = authorizationEpoch;
    reviewInFlight.current = true; setBusy(true); setNotice(undefined);
    try {
    const portfolio = await fetchMainnetPortfolio(quote.walletAddress);
    if (!mounted.current || !isAuthorizationActive(requestEpoch)) return;
    const freshQuote = { ...quote, bnbWei: portfolio.assets.bnbWei, arxiWei: portfolio.assets.arxiWei, usdtWei: portfolio.assets.usdtWei,
      blockNumber: portfolio.blockNumber, pendingNonce: portfolio.quote.pendingNonce,
      gasPriceWei: portfolio.quote.gasPriceWei, observedAt: portfolio.quote.observedAt };
    if (!isMainnetTrustedQuoteFresh(freshQuote)) throw new Error('Quote unavailable.');
    setQuote(freshQuote);
    const assetBalanceWei = parsePublicInteger(assetId === 'usdt' ? freshQuote.usdtWei : assetId === 'arxi' ? freshQuote.arxiWei : freshQuote.bnbWei);
    if (assetBalanceWei === undefined) {
      setResult(undefined); setNotice('The selected asset balance is unavailable. Refresh the portfolio before sending.'); return;
    }
    const next = prepareMainnetExecution({
      senderAddress: freshQuote.walletAddress,
      transaction: { assetId: selected.id, recipient, amount },
      snapshot: {
        chainId: 56,
        nonce: parsePublicInteger(freshQuote.pendingNonce) ?? 0n,
        gasPriceWei: parsePublicInteger(freshQuote.gasPriceWei),
        nativeBalanceWei: parsePublicInteger(freshQuote.bnbWei),
        assetBalanceWei,
        observedAt: Date.parse(freshQuote.observedAt),
      },
    });
    if (next.state === 'review-ready') {
      const cap = getMainnetSendAmountCap(assetId);
      if (next.intent.amount > cap || next.fee.feeWei > MAINNET_DIRECT_PRODUCTION_POLICY.maxFeeWei) {
        setResult(undefined); setNotice('This transfer exceeds the current amount or maximum-fee limit. Reduce the amount or retry when network fees are lower.'); return;
      }
    }
    setResult(next);
    } catch { if (mounted.current && isAuthorizationActive(requestEpoch)) { setResult(undefined); setNotice('Fresh balances and fees are temporarily unavailable. Your entered details are retained; try Review transfer again.'); } }
    finally { reviewInFlight.current = false; if (mounted.current) setBusy(false); }
  }

  if (!quote) return <Redirect href={'/wallet/mainnet-readonly' as never} />;

  return <SafeAreaView style={styles.safeArea}><ScrollView ref={scrollRef} automaticallyAdjustKeyboardInsets contentContainerStyle={styles.content} keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator>
    <Text style={styles.eyebrow}>BNB SMART CHAIN · MAINNET</Text>
    <Text style={styles.title}>Send / Transfer</Text>
    <Text style={styles.body}>Select a supported asset and enter the public recipient address.</Text>
    <View style={styles.card}>
      <Text style={styles.label}>SUPPORTED ASSET</Text>
      <View style={styles.assets}>{assets.map((asset) => <Pressable disabled={busy} key={asset.id} accessibilityRole="button" accessibilityState={{ selected: asset.id === assetId }} onPress={() => { if (isMainnetSendAssetId(asset.id)) setAssetId(asset.id); setResult(undefined); }} style={[styles.asset, asset.id === assetId && styles.assetSelected]}><Text style={[styles.assetText, asset.id === assetId && styles.assetTextSelected]}>{asset.symbol}</Text></Pressable>)}</View>
      <Text style={styles.label}>RECIPIENT</Text><TextInput editable={!busy} accessibilityLabel="Mainnet recipient address" autoCapitalize="none" autoCorrect={false} onChangeText={(value) => { setRecipient(value); setResult(undefined); }} placeholder="0x…" placeholderTextColor="#72837b" style={styles.input} value={recipient} />
      <Text style={styles.label}>AMOUNT</Text><TextInput editable={!busy} accessibilityLabel={`Mainnet ${selected?.symbol ?? 'asset'} amount`} keyboardType="decimal-pad" onChangeText={(value) => { setAmount(value); setResult(undefined); }} placeholder="0.00" placeholderTextColor="#72837b" style={styles.input} value={amount} />
      <Text style={styles.public}>Public balance and fee snapshot · Block #{quote.blockNumber}</Text>
      <Text style={styles.public}>Beta limits: 0.1 BNB, 5,000 ARXI or 100 USDT per transfer · Maximum fee 0.0001 BNB · Up to 5 transfers per 24-hour quota window.</Text>
      {assetId === 'usdt' ? <Text style={styles.public}>USDT on BNB Smart Chain (BEP-20) only. Network fees are paid in BNB, not USDT.</Text> : null}
      {!quoteFresh ? <Text style={styles.public}>Review transfer refreshes the expired quote without losing your form.</Text> : null}
      <Pressable disabled={busy || isLocked} accessibilityRole="button" onPress={() => void review()} style={({ pressed }) => [styles.primary, pressed && styles.pressed]}>{busy ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.primaryText}>Review transfer</Text>}</Pressable>
    </View>
    {notice ? <Text accessibilityRole="alert" style={styles.statusBody}>{notice}</Text> : null}
    {result ? <View style={[styles.status, result.state === 'review-ready' ? styles.statusReady : styles.statusBlocked]}><Text style={styles.statusTitle}>{result.state === 'review-ready' ? 'Transfer review ready' : 'Review not ready'}</Text><Text style={styles.statusBody}>{messageFor(result)}</Text>{result.state === 'review-ready' ? <Pressable disabled={busy || isLocked} accessibilityRole="button" onPress={() => { if (!isAuthorizationActive(authorizationEpoch)) return; setReview(result); router.push('/wallet/mainnet-transfer-preview' as never); }} style={styles.primary}><Text style={styles.primaryText}>Continue to review</Text></Pressable> : null}{result.state === 'fee-unavailable' ? <Text style={styles.statusBody}>For safety, the wallet never estimates a fee from a hard-coded value. Review again to retrieve a fresh public quote.</Text> : null}</View> : null}
    <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.secondary}><Text style={styles.secondaryText}>Return to Mainnet portfolio</Text></Pressable>
  </ScrollView></SafeAreaView>;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#04091b' }, content: { flexGrow: 1, padding: 24, paddingBottom: 96 }, eyebrow: { color: '#73b7ff', fontSize: 12, fontWeight: '900', letterSpacing: 1.4, marginTop: 16 }, title: { color: '#f8fbff', fontSize: 30, fontWeight: '900', marginTop: 9 }, body: { color: '#afc1df', fontSize: 15, lineHeight: 23, marginTop: 10 }, card: { backgroundColor: '#0c1c3d', borderColor: '#3d83e5', borderRadius: 16, borderWidth: 1, marginTop: 20, padding: 16 }, label: { color: '#83bcff', fontSize: 11, fontWeight: '900', letterSpacing: 1.2, marginTop: 16 }, assets: { flexDirection: 'row', gap: 10, marginTop: 10 }, asset: { borderColor: '#477fcb', borderRadius: 12, borderWidth: 1, minHeight: 46, paddingHorizontal: 18, justifyContent: 'center' }, assetSelected: { backgroundColor: '#397ff0', borderColor: '#66abff' }, assetText: { color: '#dceaff', fontWeight: '900' }, assetTextSelected: { color: '#f8fbff' }, input: { backgroundColor: '#091a38', borderColor: '#477fcb', borderRadius: 12, borderWidth: 1, color: '#f8fbff', fontSize: 15, marginTop: 8, minHeight: 50, paddingHorizontal: 14 }, public: { color: '#8fa9d7', fontSize: 12, marginTop: 14 }, primary: { alignItems: 'center', backgroundColor: '#397ff0', borderRadius: 14, justifyContent: 'center', marginTop: 18, minHeight: 52 }, primaryText: { color: '#f8fbff', fontSize: 15, fontWeight: '900' }, status: { borderRadius: 16, borderWidth: 1, marginTop: 16, padding: 16 }, statusReady: { backgroundColor: '#0d284a', borderColor: '#4c96f2' }, statusBlocked: { backgroundColor: '#241817', borderColor: '#be7770' }, statusTitle: { color: '#f8fbff', fontSize: 15, fontWeight: '900' }, statusBody: { color: '#c6d8f0', fontSize: 13, lineHeight: 20, marginTop: 7 }, secondary: { alignItems: 'center', borderColor: '#609cf4', borderRadius:14, borderWidth:1, justifyContent:'center', marginTop:16,minHeight:52 }, secondaryText:{color:'#cfe5ff',fontSize:15,fontWeight:'800'}, pressed:{opacity:.75},
});
