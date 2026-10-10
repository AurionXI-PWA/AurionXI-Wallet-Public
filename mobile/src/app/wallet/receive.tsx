import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Address } from 'viem';

import { ExplorerLink } from '@/components/explorer-link';
import { getAddressExplorerUrl } from '@/config/network';
import { useSessionLock } from '@/security/session-lock-provider';
import { getActiveVaultStatus } from '@/security/vault-active-identity-snapshot';
import { readWalletIdentityRecord } from '@/security/wallet-identity-record-store';

export default function ReceiveScreen() {
  const router = useRouter();
  const { isLocked } = useSessionLock();
  const [address, setAddress] = useState<Address>();
  const [state, setState] = useState<'loading' | 'ready' | 'unavailable'>('loading');

  useEffect(() => {
    let active = true;
    if (isLocked) {
      // Remove the public address from the rendered state immediately on lock.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAddress(undefined);
      setState('unavailable');
      return () => { active = false; };
    }
    void Promise.all([getActiveVaultStatus(), readWalletIdentityRecord()])
      .then(([status, identity]) => {
        if (!active) return;
        if (status === 'present' && identity) { setAddress(identity.publicAddress); setState('ready'); return; }
        setState('unavailable');
      })
      .catch(() => { if (active) setState('unavailable'); });
    return () => { active = false; };
  }, [isLocked]);

  return <SafeAreaView style={styles.safeArea}><ScrollView contentContainerStyle={styles.content}>
    <Text style={styles.eyebrow}>BNB SMART CHAIN TESTNET</Text>
    <Text style={styles.title}>Receive Assets</Text>
    <Text style={styles.body}>Share this public wallet address only. Never share a recovery phrase, private key, PIN, or biometric information.</Text>
    {state === 'loading' ? <ActivityIndicator accessibilityLabel="Loading receiving address" color="#62b2ff" style={styles.loading} /> : null}
    {state === 'ready' && address ? <View style={styles.card}>
      <Text style={styles.label}>YOUR WALLET ADDRESS</Text>
      <Text selectable accessibilityLabel="Your receiving address" style={styles.address}>{address}</Text>
      <Text style={styles.help}>Press and hold to select and copy. Always verify the complete address and selected network before receiving funds.</Text>
      <ExplorerLink label="View address on BscScan" url={getAddressExplorerUrl(address)} />
    </View> : null}
    {state === 'unavailable' ? <View style={styles.notice}><Text style={styles.noticeTitle}>Wallet is locked</Text><Text style={styles.noticeBody}>Unlock with biometric or PIN before viewing the device-local receiving address.</Text><Pressable accessibilityRole="button" onPress={() => router.replace('/wallet' as never)} style={styles.primary}><Text style={styles.primaryText}>Return to wallet</Text></Pressable></View> : null}
    <View style={styles.safety}><Text style={styles.safetyTitle}>Receiving safety</Text><Text style={styles.safetyBody}>Supported assets are the reviewed BNB Smart Chain assets shown in your wallet. Token discovery and swaps remain unavailable until a later reviewed release.</Text></View>
  </ScrollView></SafeAreaView>;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#050b1d' }, content: { padding: 24, paddingBottom: 40 }, eyebrow: { color: '#62b2ff', fontSize: 12, fontWeight: '900', letterSpacing: 1.4, marginTop: 10 }, title: { color: '#f6fbff', fontSize: 29, fontWeight: '900', marginTop: 10 }, body: { color: '#b5c8e8', fontSize: 15, lineHeight: 23, marginTop: 10 }, loading: { marginTop: 30 }, card: { backgroundColor: '#0a1732', borderColor: '#315ca3', borderRadius: 16, borderWidth: 1, marginTop: 24, padding: 16 }, label: { color: '#a9caff', fontSize: 11, fontWeight: '900', letterSpacing: 1.3 }, address: { color: '#f6fbff', fontSize: 16, fontWeight: '800', lineHeight: 26, marginTop: 14 }, help: { color: '#b5c8e8', fontSize: 13, lineHeight: 20, marginVertical: 14 }, notice: { backgroundColor: '#151b31', borderColor: '#525d95', borderRadius: 16, borderWidth: 1, marginTop: 24, padding: 16 }, noticeTitle: { color: '#e9e8ff', fontSize: 16, fontWeight: '900' }, noticeBody: { color: '#b4c6e6', fontSize: 13, lineHeight: 20, marginTop: 8 }, primary: { alignItems: 'center', backgroundColor: '#287cf5', borderRadius: 13, justifyContent: 'center', marginTop: 16, minHeight: 50 }, primaryText: { color: '#f7fbff', fontSize: 14, fontWeight: '900' }, safety: { backgroundColor: '#0a1732', borderColor: '#1e417d', borderRadius: 16, borderWidth: 1, marginTop: 18, padding: 16 }, safetyTitle: { color: '#76baff', fontSize: 15, fontWeight: '900' }, safetyBody: { color: '#b4c6e6', fontSize: 13, lineHeight: 20, marginTop: 8 },
});
