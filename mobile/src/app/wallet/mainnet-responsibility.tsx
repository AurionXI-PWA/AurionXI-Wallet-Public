import { Redirect, useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useMainnetOnboarding } from '@/security/mainnet-onboarding-provider';
import { canAccessMainnetOnboardingRoute } from '@/security/mainnet-onboarding-machine';

export default function MainnetResponsibilityScreen() {
  const router = useRouter();
  const { state, dispatch } = useMainnetOnboarding();
  if (!canAccessMainnetOnboardingRoute(state, 'responsibility')) return <Redirect href={'/wallet/mainnet-onboarding' as never} />;
  return <SafeAreaView style={styles.safeArea}><View style={styles.content}>
    <Text style={styles.eyebrow}>YOUR SECURITY</Text><Text style={styles.title}>You control your wallet</Text>
    <Text style={styles.body}>Your recovery phrase is the only way to restore your wallet. AurionXI cannot recover it, your private key, or your PIN.</Text>
    <View style={styles.warning}><Text style={styles.warningTitle}>Never share it</Text><Text style={styles.warningBody}>Support will never ask for your recovery phrase, private key, or PIN.</Text></View>
    <Pressable accessibilityRole="button" onPress={() => { dispatch({ type: 'ACCEPT_RESPONSIBILITY' }); router.push('/wallet/mainnet-recovery' as never); }} style={({ pressed }) => [styles.primary, pressed && styles.pressed]}><Text style={styles.primaryText}>I understand and accept</Text></Pressable>
  </View></SafeAreaView>;
}
const styles = StyleSheet.create({ safeArea:{flex:1,backgroundColor:'#04091b'},content:{flex:1,padding:24,justifyContent:'center'},eyebrow:{color:'#73b7ff',fontSize:12,fontWeight:'900',letterSpacing:1.6},title:{color:'#f8fbff',fontSize:30,fontWeight:'900',marginTop:12},body:{color:'#afc1df',fontSize:15,lineHeight:23,marginTop:14},warning:{backgroundColor:'#24200e',borderColor:'#806f28',borderWidth:1,borderRadius:16,padding:16,marginTop:24},warningTitle:{color:'#ffe7a5',fontSize:15,fontWeight:'900'},warningBody:{color:'#ddcf9f',fontSize:13,lineHeight:20,marginTop:6},primary:{backgroundColor:'#3b82f6',borderRadius:14,alignItems:'center',paddingVertical:15,marginTop:24},primaryText:{color:'#f8fbff',fontSize:15,fontWeight:'900'},pressed:{opacity:.78} });
