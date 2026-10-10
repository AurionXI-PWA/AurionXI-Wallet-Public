import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { getMainnetTransactionExplorerUrl, presentMainnetSubmission } from '@/security/mainnet-receipt-presentation';
import type { MainnetSubmissionRecord } from '@/storage/mainnet-submission-journal';

export function MainnetTransferRecoveryCard({ record, refreshing = false, onRefresh }: { record: MainnetSubmissionRecord; refreshing?: boolean; onRefresh?: () => void }) {
  const presentation = presentMainnetSubmission(record);
  return <View accessibilityLiveRegion="polite" style={[styles.card, presentation.tone === 'success' ? styles.success : presentation.tone === 'warning' ? styles.warning : styles.pending]}>
    <Text style={styles.label}>MAINNET TRANSFER STATUS</Text><Text style={styles.title}>{presentation.title}</Text><Text style={styles.detail}>{presentation.detail}</Text>
    <Text style={styles.detail}>Nonce: {record.nonce}</Text>
    {record.replacesTransactionHash ? <Text selectable style={styles.detail}>Original hash: {record.replacesTransactionHash}</Text> : null}
    <Text style={styles.hash} selectable>{record.transactionHash}</Text>
    <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(getMainnetTransactionExplorerUrl(record.transactionHash))} style={styles.action}><Text style={styles.actionText}>View on BscScan ↗</Text></Pressable>
    {presentation.refreshAllowed && onRefresh ? <Pressable accessibilityRole="button" accessibilityLabel="Refresh Mainnet receipt status without broadcasting again" disabled={refreshing} onPress={onRefresh} style={[styles.action, refreshing && styles.disabled]}>{refreshing ? <ActivityIndicator color="#87c3ff" /> : <Text style={styles.actionText}>Refresh status only</Text>}</Pressable> : null}
  </View>;
}

const styles = StyleSheet.create({ card:{borderRadius:16,borderWidth:1,marginTop:16,padding:16},pending:{backgroundColor:'#201d10',borderColor:'#65551f'},success:{backgroundColor:'#10251b',borderColor:'#3c7b56'},warning:{backgroundColor:'#251513',borderColor:'#6c3c37'},label:{color:'#87c3ff',fontSize:11,fontWeight:'900',letterSpacing:1.1},title:{color:'#f5f9ff',fontSize:16,fontWeight:'900',marginTop:7},detail:{color:'#bdcce3',fontSize:13,lineHeight:20,marginTop:6},hash:{backgroundColor:'#071226',borderRadius:10,color:'#dbeaff',fontFamily:'monospace',fontSize:11,lineHeight:18,marginTop:12,padding:11},action:{alignItems:'center',borderColor:'#4f90f4',borderRadius:10,borderWidth:1,justifyContent:'center',marginTop:11,minHeight:46},actionText:{color:'#87c3ff',fontSize:13,fontWeight:'900'},disabled:{opacity:.5} });
