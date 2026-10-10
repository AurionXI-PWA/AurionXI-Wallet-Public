import { Redirect, useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { formatUnits } from 'viem';

import { useMainnetSendFlow } from '@/security/mainnet-send-flow-provider';
import { evaluateMainnetDirectProductionPolicy } from '@/security/mainnet-direct-production-policy';
import { useSensitiveScreenProtection } from '@/security/use-sensitive-screen-protection';

/** Mainnet review route; native policy remains the authority for signing release. */
export default function MainnetTransferPreviewScreen() {
  useSensitiveScreenProtection();
  const router = useRouter();
  const { review, clear } = useMainnetSendFlow();
  // This controls presentation only. Android independently rechecks its
  // compiled release flag and amount/fee caps before every signature.
  const signingReleased = evaluateMainnetDirectProductionPolicy().ok;
  if (!review) return <Redirect href={'/wallet/mainnet-readonly' as never} />;
  const { intent, fee, review: envelope } = review;

  return <SafeAreaView style={styles.safeArea}><ScrollView contentContainerStyle={styles.content}>
    <Text style={styles.eyebrow}>BNB SMART CHAIN · MAINNET</Text>
    <Text style={styles.title}>Transfer Preview</Text>
    <Text style={styles.body}>Check these details carefully. The next step asks Android to authorize and send this exact transfer.</Text>
    <View style={styles.card}>
      <Detail label="NETWORK" value="BNB Smart Chain · Mainnet (56)" />
      <Detail label="SENDER" value={envelope.senderAddress} />
      <Detail label="ASSET" value={intent.asset.symbol} />
      <Detail label="AMOUNT" value={`${formatUnits(intent.amount, intent.asset.decimals)} ${intent.asset.symbol}`} />
      <Detail label="RECIPIENT" value={envelope.recipient} />
      <Detail label="MAXIMUM NETWORK FEE" value={fee.feeLabel} />
      <Detail label="AURIONXI WALLET TRANSFER FEE" value="0" />
    </View>
    <View style={styles.notice}><Text style={styles.noticeTitle}>{signingReleased ? 'Mainnet signing enabled' : 'Preview only'}</Text><Text style={styles.noticeBody}>{signingReleased ? 'Signing is restricted by the native release policy. Verify every field before continuing.' : 'Mainnet signing and broadcasting are not enabled. No signature or transaction can be created from this page.'}</Text></View>
    {signingReleased ? <Pressable accessibilityRole="button" onPress={() => router.push('/wallet/mainnet-secure-confirm' as never)} style={styles.primary}><Text style={styles.primaryText}>Continue to Send</Text></Pressable> : null}
    <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.primary}><Text style={styles.primaryText}>Edit transfer</Text></Pressable>
    <Pressable accessibilityRole="button" onPress={() => { clear(); router.replace('/wallet/mainnet-readonly' as never); }} style={styles.secondary}><Text style={styles.secondaryText}>Return to Mainnet portfolio</Text></Pressable>
  </ScrollView></SafeAreaView>;
}

function Detail({ label, value }: { label: string; value: string }) { return <View style={styles.detail}><Text style={styles.label}>{label}</Text><Text selectable style={styles.value}>{value}</Text></View>; }

const styles = StyleSheet.create({
  safeArea:{flex:1,backgroundColor:'#04091b'}, content:{padding:24,paddingBottom:40}, eyebrow:{color:'#73b7ff',fontSize:12,fontWeight:'900',letterSpacing:1.4,marginTop:16}, title:{color:'#f8fbff',fontSize:30,fontWeight:'900',marginTop:9}, body:{color:'#afc1df',fontSize:15,lineHeight:23,marginTop:10}, card:{backgroundColor:'#0c1c3d',borderColor:'#3d83e5',borderRadius:16,borderWidth:1,marginTop:20,padding:16}, detail:{borderBottomColor:'#264b85',borderBottomWidth:1,paddingVertical:10}, label:{color:'#83bcff',fontSize:11,fontWeight:'900',letterSpacing:1.2}, value:{color:'#f8fbff',fontFamily:'monospace',fontSize:13,lineHeight:20,marginTop:5}, notice:{backgroundColor:'#0d284a',borderColor:'#4c96f2',borderRadius:16,borderWidth:1,marginTop:16,padding:16}, noticeTitle:{color:'#e9f3ff',fontSize:14,fontWeight:'900'}, noticeBody:{color:'#c3d8f4',fontSize:13,lineHeight:20,marginTop:7}, primary:{alignItems:'center',backgroundColor:'#397ff0',borderRadius:14,justifyContent:'center',marginTop:18,minHeight:52}, primaryText:{color:'#f8fbff',fontSize:15,fontWeight:'900'}, secondary:{alignItems:'center',borderColor:'#609cf4',borderRadius:14,borderWidth:1,justifyContent:'center',marginTop:12,minHeight:52}, secondaryText:{color:'#cfe5ff',fontSize:15,fontWeight:'800'},
});
