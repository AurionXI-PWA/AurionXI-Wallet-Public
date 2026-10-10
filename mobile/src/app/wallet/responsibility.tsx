import { Redirect, useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useWalletOnboarding } from '@/security/wallet-onboarding-provider';
import { canAccessWalletOnboardingRoute } from '@/security/wallet-onboarding-machine';

export default function ResponsibilityScreen() {
  const router = useRouter();
  const { dispatch, state } = useWalletOnboarding();

  if (!canAccessWalletOnboardingRoute(state, 'responsibility')) return <Redirect href="/wallet" />;

  const accept = () => {
    dispatch({ type: 'ACCEPT_RESPONSIBILITY' });
    router.push('/wallet/recovery');
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content}>
        <Text style={styles.eyebrow}>NON-CUSTODIAL WALLET</Text>
        <Text style={styles.title}>You control the recovery phrase</Text>
        <Text style={styles.body}>
          AurionXI cannot recover, reset, or access your wallet. Losing the recovery phrase can
          permanently remove access to funds.
        </Text>
        <View style={styles.warning}>
          <Text style={styles.warningTitle}>Never share it</Text>
          <Text style={styles.warningBody}>
            AurionXI support will never ask for your recovery phrase, private key, or PIN.
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={accept}
          style={({ pressed }) => [styles.primary, pressed && styles.pressed]}>
          <Text style={styles.primaryText}>I understand and accept</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#071310' },
  content: { flex: 1, padding: 24, justifyContent: 'center' },
  eyebrow: { color: '#7cf6bd', fontSize: 12, fontWeight: '800', letterSpacing: 2 },
  title: { color: '#f6fbf8', fontSize: 30, fontWeight: '800', marginTop: 12 },
  body: { color: '#9eb2a9', fontSize: 15, lineHeight: 23, marginTop: 14 },
  warning: {
    backgroundColor: '#251c0e',
    borderColor: '#765b20',
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    marginTop: 24,
  },
  warningTitle: { color: '#ffe4a3', fontSize: 15, fontWeight: '800' },
  warningBody: { color: '#d2bd8d', fontSize: 13, lineHeight: 20, marginTop: 6 },
  primary: {
    backgroundColor: '#7cf6bd',
    borderRadius: 14,
    alignItems: 'center',
    paddingVertical: 15,
    marginTop: 24,
  },
  primaryText: { color: '#071310', fontSize: 15, fontWeight: '800' },
  pressed: { opacity: 0.78 },
});
