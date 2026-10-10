import { useState } from 'react';
import { Pressable, Share, Text, View, StyleSheet } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import type { Address } from 'viem';
import { createMainnetSupportReport } from '@/security/mainnet-support-report';

/** User-initiated public report; the OS share sheet never sends it automatically. */
export function MainnetSupportReportButton({ sender, disabled = false }: { sender?: Address; disabled?: boolean }) {
  const [expanded, setExpanded] = useState(false); const [busy, setBusy] = useState(false); const [message, setMessage] = useState<string>();
  async function exportReport(copy: boolean) {
    if (!sender || disabled || busy) return;
    setBusy(true); setMessage(undefined);
    try {
      const report = await createMainnetSupportReport(sender);
      if (copy) { await Clipboard.setStringAsync(report); setMessage('Support report copied and saved.'); }
      else { await Share.share({ title: 'AurionXI support report', message: report }); setMessage('Support report saved.'); }
    } catch { setMessage('Report unavailable right now. Wait for the current transfer to finish, then try again.'); }
    finally { setBusy(false); }
  }
  return <View style={styles.container}>
    <Pressable accessibilityRole="button" disabled={disabled || !sender || busy} onPress={() => setExpanded(!expanded)} style={styles.button}><Text style={styles.label}>Support report</Text></Pressable>
    {expanded ? <View><Text style={styles.body}>Includes public wallet and transfer details for troubleshooting.</Text>
      <Pressable accessibilityRole="button" disabled={disabled || busy} onPress={() => void exportReport(false)} style={styles.button}><Text style={styles.label}>{busy ? 'Preparing…' : 'Share report'}</Text></Pressable>
      <Pressable accessibilityRole="button" disabled={disabled || busy} onPress={() => void exportReport(true)} style={styles.button}><Text style={styles.label}>Copy report</Text></Pressable>
    </View> : null}
    {message ? <Text accessibilityRole="alert" style={styles.body}>{message}</Text> : null}
  </View>;
}
const styles = StyleSheet.create({ container: { marginTop: 16 }, button: { minHeight: 44, justifyContent: 'center' }, label: { color: '#87c3ff', fontSize: 13, fontWeight: '700' }, body: { color: '#aebfe0', fontSize: 13, lineHeight: 20 } });
