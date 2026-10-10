import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { formatUnits, type Address } from 'viem';

import { getAssetTargetsForNetwork } from '@/config/asset-targets';
import { NETWORK_TARGETS } from '@/config/network-targets';
import { getMainnetSupportedAssets } from '@/security/mainnet-supported-assets-policy';
import { fetchMainnetPortfolio, type MainnetPortfolio } from '@/services/mainnet-portfolio';
import { useMainnetSessionLock } from '@/security/mainnet-session-lock-provider';
import { getMainnetVaultV3Status, type VaultStatus } from '@/security/vault-store';
import { readMainnetWalletIdentityRecord } from '@/security/wallet-identity-record-store';

type CuratedBalanceKey = 'bnbWei' | 'arxiWei' | 'usdtWei' | 'usdcWei' | 'ethWei' | 'btcbWei';

const BALANCE_KEYS: Record<string, CuratedBalanceKey> = {
  'native-bnb': 'bnbWei', arxi: 'arxiWei', usdt: 'usdtWei', usdc: 'usdcWei', eth: 'ethWei', btcb: 'btcbWei',
};

function formatBalance(value: string | undefined) {
  if (value === undefined) return '—';
  const formatted = formatUnits(BigInt(value), 18);
  const [whole, fraction = ''] = formatted.split('.');
  return fraction ? `${whole}.${fraction.slice(0, 6).replace(/0+$/, '') || '0'}` : whole;
}

function AssetMark({ symbol }: { symbol: string }) {
  if (symbol === 'ARXI') return <Image accessibilityLabel="ARXI token logo" source={require('../../assets/logo-ARXI.jpg')} style={styles.logoMark} />;
  return <View style={[styles.assetMark, styles[`mark${symbol}` as keyof typeof styles] as object]}><Text style={styles.assetMarkText}>{symbol === 'BTCB' ? '₿' : symbol.slice(0, 1)}</Text></View>;
}

export default function MainnetAssetsScreen() {
  const router = useRouter();
  const { isLocked } = useMainnetSessionLock();
  const [vaultStatus, setVaultStatus] = useState<VaultStatus | 'loading'>('loading');
  const [address, setAddress] = useState<Address>();
  const [portfolio, setPortfolio] = useState<MainnetPortfolio>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  useEffect(() => {
    let active = true;
    void getMainnetVaultV3Status().then((status) => { if (active) setVaultStatus(status); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (vaultStatus === 'present' && isLocked) router.replace('/wallet/mainnet-unlock' as never);
  }, [isLocked, router, vaultStatus]);
  useEffect(() => {
    if (isLocked || vaultStatus !== 'present') return;
    let active = true;
    void readMainnetWalletIdentityRecord().then((identity) => { if (active) setAddress(identity?.publicAddress); });
    return () => { active = false; };
  }, [isLocked, vaultStatus]);

  const refresh = useCallback(async () => {
    if (!address) return;
    setLoading(true); setError(undefined);
    try { setPortfolio(await fetchMainnetPortfolio(address)); }
    catch { setError('Balances are temporarily unavailable. Pull to refresh later.'); }
    finally { setLoading(false); }
  }, [address]);

  // The first public portfolio read intentionally starts when identity hydration completes.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (address) void refresh(); }, [address, refresh]);
  const assets = getAssetTargetsForNetwork(NETWORK_TARGETS.mainnet);
  const supportById = new Map(getMainnetSupportedAssets().map((support) => [support.asset.id, support]));

  return <SafeAreaView style={styles.safeArea}>
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.header}><Pressable accessibilityLabel="Back to wallet" accessibilityRole="button" onPress={() => router.replace('/wallet/mainnet-readonly' as never)}><Text style={styles.back}>‹</Text></Pressable><Text style={styles.title}>My Assets</Text><Pressable accessibilityLabel="Refresh assets" accessibilityRole="button" onPress={() => void refresh()}><Text style={styles.refresh}>↻</Text></Pressable></View>
      <Text style={styles.network}>BNB SMART CHAIN</Text>
      <Text style={styles.subtitle}>Curated assets</Text>
      {loading ? <View style={styles.loading}><ActivityIndicator color="#66b3ff" /><Text style={styles.loadingText}>Refreshing balances</Text></View> : null}
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      <View style={styles.assetList}>
        {assets.map((asset) => {
          const value = portfolio?.assets[BALANCE_KEYS[asset.id]];
          const support = supportById.get(asset.id);
          return <View key={asset.id} style={styles.assetRow}>
            <AssetMark symbol={asset.symbol} />
            <View style={styles.assetCopy}><Text style={styles.assetName}>{asset.symbol}</Text><Text style={styles.assetDetail}>{asset.name}</Text><Text style={styles.assetCapability}>{support?.canPrepareSend ? 'View · Receive · Send review' : 'View · Receive'}</Text></View>
            <Text style={styles.amount}>{formatBalance(value)}{value === undefined ? '' : ` ${asset.symbol}`}</Text>
          </View>;
        })}
      </View>
      <Text style={styles.note}>Only curated BNB Smart Chain assets are listed here. Adding a token requires a reviewed contract address.</Text>
    </ScrollView>
    <View style={styles.bottomNavigation}>
      <Pressable accessibilityLabel="Wallet dashboard" accessibilityRole="button" onPress={() => router.replace('/wallet/mainnet-readonly' as never)} style={styles.navItem}><Text style={styles.navIcon}>▣</Text><Text style={styles.navText}>Wallet</Text></Pressable>
      <View accessibilityLabel="Assets selected" style={styles.navItem}><Text style={styles.navIconActive}>◇</Text><Text style={styles.navTextActive}>Assets</Text></View>
      <Pressable accessibilityLabel="Activity section" accessibilityRole="button" onPress={() => router.push('/wallet/mainnet-activity' as never)} style={styles.navItem}><Text style={styles.navIcon}>◷</Text><Text style={styles.navText}>Activity</Text></Pressable>
      <Pressable accessibilityLabel="Wallet settings" accessibilityRole="button" onPress={() => router.push('/wallet/settings' as never)} style={styles.navItem}><Text style={styles.navIcon}>⚙</Text><Text style={styles.navText}>Settings</Text></Pressable>
    </View>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#050b1d' }, content: { padding: 24, paddingBottom: 108 }, header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: 46 }, back: { color: '#d9eaff', fontSize: 42, fontWeight: '300', lineHeight: 42, width: 42 }, title: { color: '#f7fbff', fontSize: 24, fontWeight: '900' }, refresh: { color: '#75bbff', fontSize: 26, fontWeight: '700', width: 42, textAlign: 'right' }, network: { color: '#73b7ff', fontSize: 11, fontWeight: '900', letterSpacing: 1.5, marginTop: 26 }, subtitle: { color: '#dceaff', fontSize: 15, fontWeight: '700', marginTop: 7 }, loading: { alignItems: 'center', flexDirection: 'row', marginTop: 22 }, loadingText: { color: '#a6bfdf', fontSize: 13, marginLeft: 10 }, error: { color: '#ffbbb4', fontSize: 13, lineHeight: 20, marginTop: 18 }, assetList: { marginTop: 18 }, assetRow: { alignItems: 'center', backgroundColor: '#0c1c3d', borderBottomColor: '#244b89', borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', minHeight: 84, paddingHorizontal: 14 }, assetMark: { alignItems: 'center', borderRadius: 22, height: 44, justifyContent: 'center', marginRight: 13, width: 44 }, logoMark: { borderRadius: 22, height: 44, marginRight: 13, width: 44 }, markBNB: { backgroundColor: '#efb72f' }, markUSDT: { backgroundColor: '#26a17b' }, markUSDC: { backgroundColor: '#2775ca' }, markETH: { backgroundColor: '#6873a9' }, markBTCB: { backgroundColor: '#f7931a' }, assetMarkText: { color: '#f9fcff', fontSize: 21, fontWeight: '900' }, assetCopy: { flex: 1 }, assetName: { color: '#f7fbff', fontSize: 16, fontWeight: '900' }, assetDetail: { color: '#92acd4', fontSize: 12, marginTop: 3 }, assetCapability: { color: '#77b9ff', fontSize: 10, fontWeight: '800', marginTop: 4 }, amount: { color: '#f7fbff', fontSize: 15, fontWeight: '900', maxWidth: 142, textAlign: 'right' }, note: { color: '#8ea8cc', fontSize: 12, lineHeight: 19, marginTop: 20 }, bottomNavigation: { alignItems: 'center', backgroundColor: '#060d20', borderColor: '#152c58', borderTopWidth: 1, flexDirection: 'row', justifyContent: 'space-around', minHeight: 76, paddingBottom: 8, paddingTop: 8 }, navItem: { alignItems: 'center', justifyContent: 'center', minHeight: 52, minWidth: 58 }, navIcon: { color: '#7994c3', fontSize: 20 }, navIconActive: { color: '#64adff', fontSize: 20 }, navText: { color: '#7994c3', fontSize: 11, fontWeight: '800', marginTop: 4 }, navTextActive: { color: '#64adff', fontSize: 11, fontWeight: '900', marginTop: 4 },
});
