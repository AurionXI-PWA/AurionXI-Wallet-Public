import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Address } from 'viem';

import { ExplorerLink } from '@/components/explorer-link';
import { NETWORK_TARGETS } from '@/config/network-targets';
import { useMainnetSessionLock } from '@/security/mainnet-session-lock-provider';
import { getMainnetVaultV3Status } from '@/security/vault-store';
import { readMainnetWalletIdentityRecord } from '@/security/wallet-identity-record-store';

const CURATED_ASSETS = 'BNB · ARXI · USDT · USDC · ETH · BTCB';

export default function MainnetReceiveScreen() {
  const router = useRouter();
  const { isLocked } = useMainnetSessionLock();
  const [address, setAddress] = useState<Address>();
  const [state, setState] = useState<'loading' | 'ready' | 'unavailable'>('loading');
  const [shared, setShared] = useState(false);

  useEffect(() => {
    let active = true;
    if (isLocked) {
      // Remove the public address from the rendered state immediately on lock.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAddress(undefined);
      setState('unavailable');
      return () => { active = false; };
    }
    void Promise.all([getMainnetVaultV3Status(), readMainnetWalletIdentityRecord()]).then(([status, identity]) => {
      if (!active) return;
      if (status === 'present' && identity) { setAddress(identity.publicAddress); setState('ready'); return; }
      setState('unavailable');
    }).catch(() => { if (active) setState('unavailable'); });
    return () => { active = false; };
  }, [isLocked]);

  async function shareAddress() {
    if (!address) return;
    await Share.share({ message: `My AurionXI Wallet address on BNB Smart Chain:\n${address}` });
    setShared(true);
  }

  return <SafeAreaView style={styles.safeArea}><ScrollView contentContainerStyle={styles.content}>
    <Pressable accessibilityLabel="Back to wallet" accessibilityRole="button" onPress={() => router.back()} style={styles.backButton}><Text style={styles.back}>‹</Text></Pressable>
    <Text style={styles.eyebrow}>BNB SMART CHAIN · MAINNET</Text><Text style={styles.title}>Receive Assets</Text><Text style={styles.body}>Use this address only on BNB Smart Chain. Verify the network and complete address before receiving funds.</Text>
    {state === 'loading' ? <View style={styles.loading}><ActivityIndicator accessibilityLabel="Loading receiving address" color="#66b3ff" /><Text style={styles.loadingText}>Loading your address</Text></View> : null}
    {state === 'ready' && address ? <View style={styles.addressCard}>
      <Text style={styles.label}>YOUR WALLET ADDRESS</Text><Text selectable accessibilityLabel="Your Mainnet receiving address" style={styles.address}>{address}</Text>
      <Text style={styles.help}>Press and hold to select the full address. Never replace it with an address sent in a chat message.</Text>
      <Pressable accessibilityLabel="Share wallet address" accessibilityRole="button" onPress={() => void shareAddress()} style={({ pressed }) => [styles.share, pressed && styles.pressed]}><Text style={styles.shareText}>{shared ? 'Address shared' : 'Share address'}</Text></Pressable>
      <ExplorerLink label="View on BscScan ↗" url={`${NETWORK_TARGETS.mainnet.explorerUrl}/address/${address}`} />
    </View> : null}
    {state === 'unavailable' ? <View style={styles.notice}><Text style={styles.noticeTitle}>Wallet unavailable</Text><Text style={styles.noticeBody}>Create or unlock your wallet before viewing a receiving address.</Text><Pressable accessibilityRole="button" onPress={() => router.replace('/wallet/mainnet-onboarding' as never)} style={styles.primary}><Text style={styles.primaryText}>Set up wallet</Text></Pressable></View> : null}
    <View style={styles.supportedCard}><Text style={styles.label}>SUPPORTED ASSETS</Text><Text style={styles.supportedAssets}>{CURATED_ASSETS}</Text><Text style={styles.supportedBody}>Only receive the listed assets through BNB Smart Chain. Transfers on another network may not be recoverable.</Text></View>
    <View style={styles.supportedCard}><Text style={styles.label}>RECEIVE USDT · BSC / BEP-20</Text><Text style={styles.supportedBody}>USDT uses the same wallet address above. Select BNB Smart Chain (BEP-20) at the sending wallet or exchange, not Ethereum (ERC-20) or Tron (TRC-20). Receiving needs no token approval. Keep BNB for network fees when sending later.</Text><Text selectable style={styles.supportedBody}>USDT contract: 0x55d398326f99059fF775485246999027B3197955</Text></View>
    <View style={styles.safety}><Text style={styles.safetyTitle}>Receiving safety</Text><Text style={styles.safetyBody}>AurionXI will never ask for your recovery phrase, private key, PIN, or device access. Always confirm the address before sending funds.</Text></View>
  </ScrollView></SafeAreaView>;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#04091b' }, content: { padding: 24, paddingBottom: 48 }, backButton: { alignSelf: 'flex-start', minHeight: 46, minWidth: 46 }, back: { color: '#d9eaff', fontSize: 42, fontWeight: '300', lineHeight: 42 }, eyebrow: { color: '#73b7ff', fontSize: 14, fontWeight: '900', letterSpacing: 1.7, marginTop: 22 }, title: { color: '#f8fbff', fontSize: 30, fontWeight: '900', marginTop: 11 }, body: { color: '#aebfe0', fontSize: 15, lineHeight: 23, marginTop: 10 }, loading: { alignItems: 'center', flexDirection: 'row', marginTop: 30 }, loadingText: { color: '#aabfe0', fontSize: 13, marginLeft: 10 }, addressCard: { backgroundColor: '#0c1c3d', borderColor: '#3d83e5', borderRadius: 18, borderWidth: 1, marginTop: 24, padding: 18 }, label: { color: '#83bcff', fontSize: 11, fontWeight: '900', letterSpacing: 1.3 }, address: { color: '#f8fbff', fontSize: 16, fontWeight: '800', lineHeight: 25, marginTop: 14 }, help: { color: '#a8bddc', fontSize: 13, lineHeight: 20, marginVertical: 15 }, share: { alignItems: 'center', backgroundColor: '#397ff0', borderRadius: 13, justifyContent: 'center', minHeight: 50 }, shareText: { color: '#f8fbff', fontSize: 14, fontWeight: '900' }, notice: { backgroundColor: '#141c3e', borderColor: '#5369b4', borderRadius: 16, borderWidth: 1, marginTop: 24, padding: 16 }, noticeTitle: { color: '#e7edff', fontSize: 16, fontWeight: '900' }, noticeBody: { color: '#bbc9e8', fontSize: 13, lineHeight: 20, marginTop: 8 }, primary: { alignItems: 'center', backgroundColor: '#4287f5', borderRadius: 13, justifyContent: 'center', marginTop: 16, minHeight: 50 }, primaryText: { color: '#07142b', fontSize: 14, fontWeight: '900' }, supportedCard: { backgroundColor: '#091631', borderColor: '#244b89', borderRadius: 16, borderWidth: 1, marginTop: 18, padding: 16 }, supportedAssets: { color: '#f4f8ff', fontSize: 16, fontWeight: '900', lineHeight: 26, marginTop: 10 }, supportedBody: { color: '#a9bdd9', fontSize: 13, lineHeight: 20, marginTop: 8 }, safety: { backgroundColor: '#0b2022', borderColor: '#245d63', borderRadius: 16, borderWidth: 1, marginTop: 18, padding: 16 }, safetyTitle: { color: '#81e3dd', fontSize: 15, fontWeight: '900' }, safetyBody: { color: '#bad9d6', fontSize: 13, lineHeight: 20, marginTop: 8 }, pressed: { opacity: 0.75 },
});
