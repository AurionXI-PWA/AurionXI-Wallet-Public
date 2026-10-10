import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, AppState, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Address } from 'viem';

import { canReviewMainnetReplacement } from '@/security/mainnet-replacement-actions';
import { MainnetSupportReportButton } from '@/components/mainnet-support-report-button';
import { MainnetActivityCard } from '@/components/mainnet-activity-card';
import { mergeMainnetActivityEntries } from '@/security/mainnet-activity-entries';
import { useMainnetTransfers } from '@/hooks/use-mainnet-transfers';
import { NETWORK_TARGETS } from '@/config/network-targets';
import { useMainnetActivity } from '@/hooks/use-mainnet-activity';
import { useMainnetSessionLock } from '@/security/mainnet-session-lock-provider';
import { getMainnetVaultV3Status, type VaultStatus } from '@/security/vault-store';
import { readMainnetWalletIdentityRecord } from '@/security/wallet-identity-record-store';

export default function MainnetActivityScreen() {
  const router = useRouter();
  const { isLocked } = useMainnetSessionLock();
  const [vaultStatus, setVaultStatus] = useState<VaultStatus | 'loading'>('loading');
  const [address, setAddress] = useState<Address>();
  const [focused, setFocused] = useState(false);
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const [visibleCount, setVisibleCount] = useState(10);
  const [explorerError, setExplorerError] = useState(false);
  useFocusEffect(useCallback(() => { setFocused(true); return () => setFocused(false); }, []));
  const enabled = Boolean(address) && !isLocked && focused && foreground;
  const activity = useMainnetActivity(address, enabled);
  const transfers = useMainnetTransfers(address, enabled);
  const entries = useMemo(() => mergeMainnetActivityEntries(activity.state === 'ready' ? activity.items : [], transfers.records, isLocked ? undefined : address), [activity.items, activity.state, transfers.records, address, isLocked]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => setForeground(next === 'active'));
    return () => subscription.remove();
  }, []);
  useEffect(() => { setVisibleCount(10); setExplorerError(false); }, [address]);

  useEffect(() => {
    let active = true;
    void getMainnetVaultV3Status().then((status) => { if (active) setVaultStatus(status); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (vaultStatus === 'present' && isLocked) router.replace('/wallet/mainnet-unlock' as never);
  }, [isLocked, router, vaultStatus]);
  useEffect(() => {
    if (isLocked || vaultStatus !== 'present') { setAddress(undefined); return; }
    let active = true;
    void readMainnetWalletIdentityRecord().then((identity) => { if (active) setAddress(identity?.publicAddress); });
    return () => { active = false; };
  }, [isLocked, vaultStatus]);

  const openBscScan = async () => {
    if (!address) return;
    setExplorerError(false);
    try { await Linking.openURL(`${NETWORK_TARGETS.mainnet.explorerUrl}/address/${address}#tokentxns`); }
    catch { setExplorerError(true); }
  };

  return <SafeAreaView style={styles.safeArea}>
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.header}><Pressable accessibilityLabel="Back to wallet" accessibilityRole="button" onPress={() => router.replace('/wallet/mainnet-readonly' as never)}><Text style={styles.back}>‹</Text></Pressable><Text style={styles.title}>Activity</Text><Pressable accessibilityLabel="Refresh activity and transfer status" accessibilityRole="button" onPress={() => { activity.refresh(); transfers.refresh(); }}><Text style={styles.refresh}>↻</Text></Pressable></View>
      <Text style={styles.network}>BNB SMART CHAIN</Text>
      {transfers.unavailable ? <Text accessibilityRole="alert" style={styles.empty}>Transfer status is temporarily unavailable. Do not send again while submission is uncertain.</Text> : null}
      <Text style={styles.subtitle}>Recent activity</Text>
      <View>
        {activity.state === 'loading' ? <View style={styles.status}><ActivityIndicator color="#66b3ff" /><Text style={styles.statusText}>Refreshing activity</Text></View> : null}
        {entries.slice(0, visibleCount).map((entry) => <MainnetActivityCard key={entry.key} entry={entry} replacementAllowed={Boolean(entry.record && canReviewMainnetReplacement(entry.record, transfers.nativeRecords))} refreshing={transfers.refreshing} onRefresh={() => transfers.refreshHash(entry.hash)} />)}
        {activity.state === 'ready' && entries.length === 0 ? <Text style={styles.empty}>No recent curated asset activity found.</Text> : null}
        {(activity.state === 'error' || activity.state === 'unconfigured') ? <Text style={styles.empty}>Activity is temporarily unavailable. You can still view complete public activity on BscScan.</Text> : null}
        {activity.showingSavedHistory ? <Text style={styles.cacheNote}>Showing last verified activity</Text> : null}
      </View>
      {entries.length > visibleCount ? <Pressable accessibilityRole="button" onPress={() => setVisibleCount((count) => count + 10)} style={styles.explorer}><Text style={styles.explorerText}>Show more transactions</Text></Pressable> : null}
      <Pressable accessibilityHint="Opens the wallet's public activity on BscScan" accessibilityLabel="View full activity on BscScan" accessibilityRole="link" disabled={!address} onPress={() => void openBscScan()} style={({ pressed }) => [styles.explorer, !address && styles.disabled, pressed && styles.pressed]}><Text style={styles.explorerText}>View full activity on BscScan ↗</Text></Pressable>
      <MainnetSupportReportButton sender={address} disabled={!enabled || transfers.refreshing} />
      {explorerError ? <Text accessibilityRole="alert" style={styles.empty}>BscScan could not be opened. Transaction entries above retain their exact hashes.</Text> : null}
    </ScrollView>
    <View style={styles.bottomNavigation}>
      <Pressable accessibilityLabel="Wallet dashboard" accessibilityRole="button" onPress={() => router.replace('/wallet/mainnet-readonly' as never)} style={styles.navItem}><Text style={styles.navIcon}>▣</Text><Text style={styles.navText}>Wallet</Text></Pressable>
      <Pressable accessibilityLabel="Assets section" accessibilityRole="button" onPress={() => router.push('/wallet/mainnet-assets' as never)} style={styles.navItem}><Text style={styles.navIcon}>◇</Text><Text style={styles.navText}>Assets</Text></Pressable>
      <View accessibilityLabel="Activity selected" style={styles.navItem}><Text style={styles.navIconActive}>◷</Text><Text style={styles.navTextActive}>Activity</Text></View>
      <Pressable accessibilityLabel="Wallet settings" accessibilityRole="button" onPress={() => router.push('/wallet/settings' as never)} style={styles.navItem}><Text style={styles.navIcon}>⚙</Text><Text style={styles.navText}>Settings</Text></Pressable>
    </View>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#050b1d' }, content: { padding: 24, paddingBottom: 108 }, header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: 46 }, back: { color: '#d9eaff', fontSize: 42, fontWeight: '300', lineHeight: 42, width: 42 }, title: { color: '#f7fbff', fontSize: 24, fontWeight: '900' }, refresh: { color: '#75bbff', fontSize: 26, fontWeight: '700', width: 42, textAlign: 'right' }, network: { color: '#73b7ff', fontSize: 11, fontWeight: '900', letterSpacing: 1.5, marginTop: 26 }, subtitle: { color: '#dceaff', fontSize: 15, fontWeight: '700', marginTop: 7 }, card: { backgroundColor: '#0c1c3d', borderColor: '#315c9c', borderRadius: 16, borderWidth: 1, marginTop: 18, paddingHorizontal: 16 }, status: { alignItems: 'center', flexDirection: 'row', minHeight: 78 }, statusText: { color: '#abc4e8', fontSize: 13, marginLeft: 10 }, empty: { color: '#b8c7e3', fontSize: 14, lineHeight: 21, paddingVertical: 20 }, cacheNote: { color: '#98b5dd', fontSize: 12, marginBottom: 16 }, explorer: { alignItems: 'center', borderColor: '#4f90f4', borderRadius: 14, borderWidth: 1, justifyContent: 'center', marginTop: 18, minHeight: 52 }, explorerText: { color: '#87c3ff', fontSize: 14, fontWeight: '900' }, disabled: { opacity: 0.45 }, pressed: { opacity: 0.74 }, bottomNavigation: { alignItems: 'center', backgroundColor: '#060d20', borderColor: '#152c58', borderTopWidth: 1, flexDirection: 'row', justifyContent: 'space-around', minHeight: 76, paddingBottom: 8, paddingTop: 8 }, navItem: { alignItems: 'center', justifyContent: 'center', minHeight: 52, minWidth: 58 }, navIcon: { color: '#7994c3', fontSize: 20 }, navIconActive: { color: '#64adff', fontSize: 20 }, navText: { color: '#7994c3', fontSize: 11, fontWeight: '800', marginTop: 4 }, navTextActive: { color: '#64adff', fontSize: 11, fontWeight: '900', marginTop: 4 },
});
