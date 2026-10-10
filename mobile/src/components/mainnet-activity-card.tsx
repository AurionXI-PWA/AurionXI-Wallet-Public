import { useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { getMainnetActivityRows, presentMainnetActivityEntry, type MainnetActivityEntry } from '@/security/mainnet-activity-entries';
import { getMainnetTransactionExplorerUrl } from '@/security/mainnet-receipt-presentation';
import { shortenAddress } from '@/utils/address';

/** One transaction card owns its asset events, exact hash, receipt status and explorer link. */
export function MainnetActivityCard({ entry, refreshing = false, onRefresh, replacementAllowed = false }: {
  entry: MainnetActivityEntry; replacementAllowed?: boolean; refreshing?: boolean; onRefresh?: () => void;
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [linkError, setLinkError] = useState(false);
  const presentation = presentMainnetActivityEntry(entry);
  const rows = getMainnetActivityRows(entry);
  const timestamp = new Date(entry.timestamp);
  async function openTransaction() {
    setLinkError(false);
    try { await Linking.openURL(getMainnetTransactionExplorerUrl(entry.hash)); }
    catch { setLinkError(true); }
  }
  return <View style={styles.card}>
    <Text style={[styles.status, presentation.tone === 'success' ? styles.success : presentation.tone === 'warning' ? styles.warning : styles.pending]}>{presentation.title}</Text>
    {rows.map((row) => <View key={row.key} style={styles.row}>
      <View style={styles.partyGroup}><Text style={[styles.direction, row.failed && styles.failed]}>{row.direction}</Text>
        <Text style={styles.counterparty}>{row.counterpartyLabel}: {shortenAddress(row.counterparty)}</Text></View>
      <View style={styles.amountGroup}><Text style={styles.amount}>{row.amount} {row.symbol}</Text>
        <Text style={styles.meta}>{timestamp.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })} · {timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text></View>
    </View>)}
    <Pressable accessibilityRole="link" accessibilityLabel={`View transaction ${entry.hash} on BscScan`} accessibilityHint="Opens only this transaction on BNB Smart Chain Mainnet" onPress={() => void openTransaction()} style={({ pressed }) => [styles.hashLink, pressed && styles.pressed]}>
      <Text style={styles.hashLabel}>TRANSACTION HASH · BscScan ↗</Text>
      <Text selectable style={styles.hash}>{entry.hash}</Text>
    </Pressable>
    {presentation.tone === 'warning' ? <Text style={styles.warningDetail}>{presentation.detail}</Text> : null}
    {linkError ? <Text accessibilityRole="alert" style={styles.warningDetail}>BscScan could not be opened. The transaction hash above is retained; no transfer was sent by this action.</Text> : null}
    <View style={styles.actions}>
      <Pressable accessibilityRole="button" accessibilityLabel={expanded ? 'Hide transaction details' : 'Show transaction details'} accessibilityState={{ expanded }} onPress={() => setExpanded(!expanded)} style={styles.action}>
        <Text style={styles.actionText}>{expanded ? 'Hide details' : 'Details'}</Text>
      </Pressable>
      {entry.record && presentation.refreshAllowed && onRefresh ? <Pressable accessibilityRole="button" accessibilityLabel="Check transaction status without sending again" disabled={refreshing} onPress={onRefresh} style={[styles.action, refreshing && styles.disabled]}>
        {refreshing ? <ActivityIndicator color="#87c3ff" /> : <Text style={styles.actionText}>Check status</Text>}
      </Pressable> : null}
      {entry.record && !entry.record.operation && replacementAllowed ? (['speed-up', 'cancel'] as const).map(kind => <Pressable key={kind} accessibilityRole="button" disabled={refreshing} style={[styles.action, refreshing && styles.disabled]} onPress={() => router.push({ pathname: '/wallet/mainnet-replacement-review', params: { sender: entry.record!.senderAddress, nonce: String(entry.record!.nonce), hash: entry.hash, kind } } as never)}><Text style={styles.actionText}>{kind === 'cancel' ? 'Cancel' : 'Retry / Speed Up'}</Text></Pressable>) : null}
    </View>
    {expanded ? <View style={styles.details}>
      {presentation.tone !== 'warning' ? <Text style={styles.detail}>{presentation.detail}</Text> : null}
      {rows.map((row) => <Text selectable key={row.key} style={styles.detail}>{`${row.counterpartyLabel}: ${row.counterparty}`}</Text>)}
      {entry.record ? <Text style={styles.detail}>Nonce: {entry.record.nonce}{entry.record.blockNumber ? ` · Block #${entry.record.blockNumber}` : ''}</Text> : null}
    </View> : null}
  </View>;
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#0c1c3d', borderColor: '#315c9c', borderRadius: 16, borderWidth: 1, marginTop: 12, padding: 15 },
  status: { alignSelf: 'flex-start', borderRadius: 7, fontSize: 11, fontWeight: '800', paddingHorizontal: 8, paddingVertical: 5 },
  success: { backgroundColor: '#12392c', color: '#9ef0c9' }, warning: { backgroundColor: '#382320', color: '#ffbeb2' }, pending: { backgroundColor: '#162e51', color: '#acd3ff' },
  row: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, gap: 12 },
  partyGroup: { flex: 1 }, direction: { color: '#9ef0c9', fontSize: 14, fontWeight: '800' }, failed: { color: '#ff9d90' }, counterparty: { color: '#a7b9d6', fontSize: 12, marginTop: 5 },
  amountGroup: { alignItems: 'flex-end', flex: 1 }, amount: { color: '#eff3ff', fontSize: 15, fontWeight: '800', textAlign: 'right' }, meta: { color: '#a7b9d6', fontSize: 10, marginTop: 5, textAlign: 'right' },
  hashLink: { backgroundColor: '#08162e', borderRadius: 9, minHeight: 48, padding: 10 }, hashLabel: { color: '#87c3ff', fontSize: 10, fontWeight: '800', marginBottom: 5 }, hash: { color: '#c4ddff', fontFamily: 'monospace', fontSize: 11, lineHeight: 17 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 6 }, action: { alignItems: 'center', justifyContent: 'center', minHeight: 44, paddingHorizontal: 8 }, actionText: { color: '#87c3ff', fontSize: 12, fontWeight: '800' },
  details: { borderTopColor: '#315c9c', borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 6 }, detail: { color: '#b9c9e3', fontSize: 12, lineHeight: 19, marginTop: 5 }, warningDetail: { color: '#ffbeb2', fontSize: 12, lineHeight: 19, marginTop: 9 }, disabled: { opacity: 0.5 }, pressed: { opacity: 0.7 },
});
