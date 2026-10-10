import { Redirect, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Address } from 'viem';

import { usePortfolio } from '@/hooks/use-portfolio';
import { useSessionLock } from '@/security/session-lock-provider';
import { readWalletIdentityRecord } from '@/security/wallet-identity-record-store';

function AssetMark({ symbol }: { symbol: 'tBNB' | 'ARXI' | 'USDT' }) {
  if (symbol === 'ARXI') return <Image accessibilityLabel="ARXI token logo" source={require('../../assets/logo-ARXI.jpg')} style={styles.logoMark} />;
  return <View style={[styles.assetMark, symbol === 'tBNB' ? styles.bnbMark : styles.usdtMark]}><Text style={styles.assetMarkText}>{symbol === 'tBNB' ? 'B' : 'T'}</Text></View>;
}

function AssetRow({ amount, detail, symbol }: { amount: string; detail: string; symbol: 'tBNB' | 'ARXI' | 'USDT' }) {
  return <View style={styles.assetRow}><AssetMark symbol={symbol} /><View style={styles.assetCopy}><Text style={styles.assetSymbol}>{symbol}</Text><Text style={styles.assetDetail}>{detail}</Text></View><Text style={styles.assetAmount}>{amount} {symbol}</Text></View>;
}

/** Testnet dashboard only reads the separately stored Testnet identity and public balances. */
export default function TestnetDashboardScreen() {
  const router = useRouter();
  const { isLocked } = useSessionLock();
  const [address, setAddress] = useState<Address>();
  const [notice, setNotice] = useState<string>();
  const { portfolio, state, error, refresh } = usePortfolio(address);

  useEffect(() => {
    if (isLocked) return;
    let active = true;
    void readWalletIdentityRecord().then((identity) => { if (active) setAddress(identity?.publicAddress); });
    return () => { active = false; };
  }, [isLocked]);

  if (isLocked) return <Redirect href={'/wallet' as never} />;
  const sendPath = portfolio && address
    ? `/wallet/transaction-review?bnbBalanceWei=${portfolio.bnbBalanceWei}&gasPriceWei=${portfolio.gasPriceWei}&walletAddress=${address}`
    : '/wallet/transaction-review';

  return <SafeAreaView style={styles.safeArea}>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Pressable accessibilityLabel="Return to Mainnet wallet" accessibilityRole="button" onPress={() => router.replace('/wallet/mainnet-readonly' as never)} style={styles.backButton}><Text style={styles.backText}>‹ Back to Mainnet</Text></Pressable>
      <View style={styles.header}><View><Text style={styles.walletName}>AurionXI Wallet</Text><Text selectable accessibilityLabel="Testnet wallet address. Press and hold to copy." style={styles.address}>{address ?? 'Loading address…'}</Text><Text style={styles.addressHint}>Press and hold the address to copy</Text></View><Pressable accessibilityLabel="Open settings" accessibilityRole="button" onPress={() => router.push('/wallet/settings' as never)} style={styles.menu}><Text style={styles.menuText}>☰</Text></Pressable></View>
      <View accessibilityLabel="BNB Smart Chain Testnet" style={styles.networkBadge}><Text style={styles.network}>BNB SMART CHAIN TESTNET</Text></View>

      <View style={styles.totalCard}><Text style={styles.totalLabel}>TOTAL BALANCE</Text><Text style={styles.totalValue}>{portfolio ? `${portfolio.bnbBalance} tBNB` : '—'}</Text><Text style={styles.totalCaption}>Testnet assets</Text></View>

      <View style={styles.actionRow}>
        <Pressable accessibilityLabel="Send Testnet assets" accessibilityRole="button" onPress={() => router.push(sendPath as never)} style={styles.action}><Text style={styles.actionIcon}>↑</Text><Text style={styles.actionText}>Send</Text></Pressable>
        <Pressable accessibilityLabel="Receive Testnet assets" accessibilityRole="button" onPress={() => router.push('/wallet/receive' as never)} style={styles.action}><Text style={styles.actionIcon}>↓</Text><Text style={styles.actionText}>Receive</Text></Pressable>
        <Pressable accessibilityLabel="Swap, coming soon" accessibilityRole="button" onPress={() => setNotice('Swap will be available in a future update.')} style={[styles.action, styles.actionDisabled]}><Text style={styles.actionIcon}>↔</Text><Text style={styles.actionText}>Swap</Text></Pressable>
        <Pressable accessibilityLabel="View Testnet activity" accessibilityRole="button" onPress={() => router.push('/wallet/testnet-activity' as never)} style={styles.action}><Text style={styles.actionIcon}>◷</Text><Text style={styles.actionText}>History</Text></Pressable>
      </View>
      {notice ? <Text accessibilityLiveRegion="polite" style={styles.notice}>{notice}</Text> : null}

      <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>My Assets</Text><Pressable accessibilityLabel="View all Testnet assets" accessibilityRole="button" onPress={() => router.push('/wallet/testnet-assets' as never)}><Text style={styles.addAsset}>View all</Text></Pressable></View>
      {state === 'loading' || state === 'refreshing' ? <View style={styles.loading}><ActivityIndicator color="#73b7ff" /><Text style={styles.loadingText}>Refreshing balances</Text></View> : null}
      {error ? <Pressable accessibilityRole="button" onPress={refresh} style={styles.errorCard}><Text style={styles.errorText}>Balances are temporarily unavailable. Tap to refresh.</Text></Pressable> : null}
      <View style={styles.assetList}>
        <AssetRow amount={portfolio?.bnbBalance ?? '—'} detail="BNB Smart Chain Testnet" symbol="tBNB" />
        <AssetRow amount={portfolio?.arxiBalance ?? '—'} detail="AurionXI Token" symbol="ARXI" />
        <AssetRow amount={portfolio?.usdtBalance ?? '—'} detail="Tether USD" symbol="USDT" />
      </View>
    </ScrollView>
    <View style={styles.bottomNavigation}>
      <View accessibilityLabel="Testnet wallet selected" style={styles.navItem}><Text style={styles.navIconActive}>▣</Text><Text style={styles.navTextActive}>Wallet</Text></View>
      <Pressable accessibilityLabel="Testnet assets" accessibilityRole="button" onPress={() => router.push('/wallet/testnet-assets' as never)} style={styles.navItem}><Text style={styles.navIcon}>◇</Text><Text style={styles.navText}>Assets</Text></Pressable>
      <Pressable accessibilityLabel="Testnet activity" accessibilityRole="button" onPress={() => router.push('/wallet/testnet-activity' as never)} style={styles.navItem}><Text style={styles.navIcon}>◷</Text><Text style={styles.navText}>Activity</Text></Pressable>
      <Pressable accessibilityLabel="Wallet settings" accessibilityRole="button" onPress={() => router.push('/wallet/settings' as never)} style={styles.navItem}><Text style={styles.navIcon}>⚙</Text><Text style={styles.navText}>Settings</Text></Pressable>
    </View>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#050b1d' }, content: { padding: 24, paddingBottom: 108 }, backButton: { alignSelf: 'flex-start', borderColor: '#4f90f4', borderRadius: 10, borderWidth: 1, marginTop: 10, paddingHorizontal: 12, paddingVertical: 8 }, backText: { color: '#b7d9ff', fontSize: 13, fontWeight: '800' }, networkBadge: { alignItems: 'center', backgroundColor: '#0c3028', borderColor: '#38b98a', borderRadius: 14, borderWidth: 1, justifyContent: 'center', marginTop: 18, minHeight: 52 }, network: { color: '#7cf6bd', fontSize: 12, fontWeight: '900', letterSpacing: 1.5 }, header: { alignItems: 'flex-start', flexDirection: 'row', justifyContent: 'space-between', marginTop: 18 }, walletName: { color: '#f7fbff', fontSize: 23, fontWeight: '900' }, address: { color: '#a8c9f3', fontSize: 15, fontWeight: '700', lineHeight: 23, marginTop: 5, maxWidth: 280 }, addressHint: { color: '#7796c3', fontSize: 11, marginTop: 3 }, menu: { alignItems: 'center', borderColor: '#4f90f4', borderRadius: 12, borderWidth: 1, height: 40, justifyContent: 'center', width: 40 }, menuText: { color: '#b7d9ff', fontSize: 20, fontWeight: '900' }, totalCard: { alignItems: 'center', backgroundColor: '#0d4033', borderColor: '#47dba4', borderRadius: 18, borderWidth: 1, marginTop: 18, padding: 20 }, totalLabel: { color: '#9bf7d5', fontSize: 11, fontWeight: '900', letterSpacing: 1.4 }, totalValue: { color: '#7cf6bd', fontSize: 29, fontWeight: '900', marginTop: 9 }, totalCaption: { color: '#d5fff0', fontSize: 13, fontWeight: '700', marginTop: 6 }, actionRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 20 }, action: { alignItems: 'center', minHeight: 72, width: '23%' }, actionIcon: { backgroundColor: '#0b2556', borderColor: '#194d9c', borderRadius: 26, borderWidth: 1, color: '#80c1ff', fontSize: 29, fontWeight: '900', height: 52, overflow: 'hidden', paddingTop: 8, textAlign: 'center', width: 52 }, actionText: { color: '#c8daff', fontSize: 11, fontWeight: '800', marginTop: 7 }, actionDisabled: { opacity: .62 }, notice: { color: '#a9caff', fontSize: 12, marginTop: 8, textAlign: 'center' }, sectionHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: 26 }, sectionTitle: { color: '#f7fbff', fontSize: 21, fontWeight: '900' }, addAsset: { color: '#73b7ff', fontSize: 13, fontWeight: '900' }, loading: { alignItems: 'center', flexDirection: 'row', marginTop: 17 }, loadingText: { color: '#a8c9f3', fontSize: 13, marginLeft: 10 }, errorCard: { backgroundColor: '#1c2948', borderColor: '#4f6ca6', borderRadius: 13, borderWidth: 1, marginTop: 16, padding: 14 }, errorText: { color: '#c8daff', fontSize: 13, lineHeight: 19 }, assetList: { backgroundColor: '#0c1c3d', borderColor: '#315c9c', borderRadius: 16, borderWidth: 1, marginTop: 16, overflow: 'hidden' }, assetRow: { alignItems: 'center', borderBottomColor: '#244b89', borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', minHeight: 82, paddingHorizontal: 14 }, assetMark: { alignItems: 'center', borderRadius: 21, height: 42, justifyContent: 'center', marginRight: 13, width: 42 }, logoMark: { borderRadius: 21, height: 42, marginRight: 13, width: 42 }, bnbMark: { backgroundColor: '#efb72f' }, usdtMark: { backgroundColor: '#26a17b' }, assetMarkText: { color: '#f9fcff', fontSize: 20, fontWeight: '900' }, assetCopy: { flex: 1 }, assetSymbol: { color: '#f7fbff', fontSize: 16, fontWeight: '900' }, assetDetail: { color: '#92acd4', fontSize: 12, marginTop: 3 }, assetAmount: { color: '#f7fbff', fontSize: 15, fontWeight: '900', maxWidth: 138, textAlign: 'right' }, bottomNavigation: { alignItems: 'center', backgroundColor: '#060d20', borderColor: '#152c58', borderTopWidth: 1, flexDirection: 'row', justifyContent: 'space-around', minHeight: 76, paddingBottom: 8, paddingTop: 8 }, navItem: { alignItems: 'center', justifyContent: 'center', minHeight: 52, minWidth: 58 }, navIcon: { color: '#7994c3', fontSize: 20 }, navIconActive: { color: '#64adff', fontSize: 20 }, navText: { color: '#7994c3', fontSize: 11, fontWeight: '800', marginTop: 4 }, navTextActive: { color: '#64adff', fontSize: 11, fontWeight: '900', marginTop: 4 },
});
