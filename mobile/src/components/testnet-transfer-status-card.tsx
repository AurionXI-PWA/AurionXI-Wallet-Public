import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { getTransactionExplorerUrl } from '@/config/network';
import {
  INITIAL_TESTNET_TRANSACTION_STATUS,
  presentTestnetTransactionStatus,
  type TestnetTransactionStatus,
} from '@/security/testnet-transaction-status';

export function TestnetTransferStatusCard({
  status = INITIAL_TESTNET_TRANSACTION_STATUS,
  onRefreshStatus,
  refreshing = false,
}: {
  status?: TestnetTransactionStatus;
  onRefreshStatus?: () => void;
  refreshing?: boolean;
}) {
  const presentation = presentTestnetTransactionStatus(status);
  const hash = status.stage === 'idle' ? undefined : status.hash;
  const canRefresh = status.stage === 'submitted'
    || status.stage === 'pending'
    || (status.stage === 'failed' && status.reason === 'status-unavailable' && status.retryAllowed);
  const isReceiptRecovery = status.stage === 'failed' && status.reason === 'status-unavailable' && status.retryAllowed;
  return (
    <View accessibilityLabel={`Transfer status: ${presentation.title}. ${presentation.detail}`} accessibilityLiveRegion="polite" style={[styles.card, toneStyles[presentation.tone]]}>
      <Text style={styles.label}>TRANSFER STATUS</Text>
      <Text style={styles.title}>{presentation.title}</Text>
      <Text selectable style={styles.detail}>{presentation.detail}</Text>
      {hash ? <View style={styles.hashPanel}>
        <Text style={styles.hashLabel}>TRANSACTION HASH</Text>
        <Text selectable style={styles.hash}>{hash}</Text>
      </View> : null}
      {hash ? <Pressable
        accessibilityRole="link"
        accessibilityLabel="View transaction on BscScan"
        onPress={() => { void Linking.openURL(getTransactionExplorerUrl(hash)); }}
        style={({ pressed }) => [styles.action, pressed && styles.pressed]}>
        <Text style={styles.actionText}>View on BscScan ↗</Text>
      </Pressable> : null}
      {canRefresh && onRefreshStatus ? <Pressable
        accessibilityRole="button"
        accessibilityLabel={isReceiptRecovery ? 'Refresh confirmation status without sending again' : 'Refresh transaction status'}
        accessibilityState={{ disabled: refreshing }}
        disabled={refreshing}
        onPress={onRefreshStatus}
        style={({ pressed }) => [styles.action, refreshing && styles.actionDisabled, pressed && styles.pressed]}>
        {refreshing ? <ActivityIndicator color="#7cf6bd" /> : <Text style={styles.actionText}>{isReceiptRecovery ? 'Refresh confirmation status' : 'Refresh status'}</Text>}
      </Pressable> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, borderWidth: 1, marginTop: 18, padding: 16 },
  label: { color: '#7cf6bd', fontSize: 11, fontWeight: '800', letterSpacing: 1.1 },
  title: { color: '#e5f5ed', fontSize: 15, fontWeight: '800', marginTop: 7 },
  detail: { color: '#a8bbb2', fontSize: 13, lineHeight: 20, marginTop: 6 },
  hashPanel: { backgroundColor: '#071310', borderColor: '#294038', borderRadius: 10, borderWidth: 1, marginTop: 12, minHeight: 82, padding: 12 },
  hashLabel: { color: '#8ea49a', fontSize: 10, fontWeight: '800', letterSpacing: 1.1 },
  hash: { color: '#dff8eb', flexShrink: 1, fontFamily: 'monospace', fontSize: 12, letterSpacing: 0.15, lineHeight: 19, marginTop: 8 },
  action: { alignItems: 'center', borderColor: '#4aa37d', borderRadius: 10, borderWidth: 1, marginTop: 12, minHeight: 48, justifyContent: 'center', paddingHorizontal: 12, paddingVertical: 10 },
  actionText: { color: '#7cf6bd', fontSize: 13, fontWeight: '800' },
  actionDisabled: { opacity: 0.55 },
  pressed: { opacity: 0.78 },
});

const toneStyles = StyleSheet.create({
  neutral: { backgroundColor: '#0c1c17', borderColor: '#1b352c' },
  pending: { backgroundColor: '#201d10', borderColor: '#65551f' },
  success: { backgroundColor: '#10251b', borderColor: '#3c7b56' },
  warning: { backgroundColor: '#251513', borderColor: '#6c3c37' },
});
