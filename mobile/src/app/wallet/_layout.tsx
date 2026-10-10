import { Stack } from 'expo-router';

export default function WalletSetupLayout() {
  return (
    <Stack
      screenOptions={{
        contentStyle: { backgroundColor: '#071310' },
        headerStyle: { backgroundColor: '#071310' },
        headerTintColor: '#f6fbf8',
        headerTitleStyle: { fontWeight: '700' },
      }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="responsibility" options={{ title: 'Your Responsibility' }} />
      <Stack.Screen name="recovery" options={{ title: 'Recovery Protection' }} />
      <Stack.Screen name="pin" options={{ title: 'PIN Protection' }} />
      <Stack.Screen name="biometric" options={{ headerShown: false }} />
      <Stack.Screen name="receive" options={{ headerShown: false }} />
      <Stack.Screen name="testnet-dashboard" options={{ headerShown: false }} />
      <Stack.Screen name="testnet-assets" options={{ headerShown: false }} />
      <Stack.Screen name="testnet-activity" options={{ headerShown: false }} />
      <Stack.Screen name="settings" options={{ headerShown: false }} />
      <Stack.Screen name="synthetic-vault-replacement" options={{ title: 'Replace Test Vault' }} />
      <Stack.Screen name="identity-migration" options={{ title: 'Secure Wallet Identity' }} />
      <Stack.Screen name="testnet-namespace-migration" options={{ title: 'Secure Testnet Storage' }} />
      <Stack.Screen name="mainnet-readonly" options={{ headerShown: false }} />
      <Stack.Screen name="mainnet-assets" options={{ headerShown: false }} />
      <Stack.Screen name="mainnet-activity" options={{ headerShown: false }} />
      <Stack.Screen name="mainnet-receive" options={{ headerShown: false }} />
      <Stack.Screen name="mainnet-onboarding" options={{ headerShown: false }} />
      <Stack.Screen name="mainnet-responsibility" options={{ title: 'Mainnet Responsibility' }} />
      <Stack.Screen name="mainnet-recovery" options={{ title: 'Mainnet Recovery Protection' }} />
      <Stack.Screen name="mainnet-pin" options={{ title: 'Mainnet PIN Protection' }} />
      <Stack.Screen name="mainnet-biometric" options={{ title: 'Mainnet Biometric Unlock' }} />
      <Stack.Screen name="mainnet-unlock" options={{ headerShown: false }} />
      <Stack.Screen name="mainnet-recovery-view" options={{ headerShown: false }} />
      <Stack.Screen name="testnet-recovery-view" options={{ headerShown: false }} />
      <Stack.Screen name="mainnet-send-review" options={{ headerShown: false }} />
      <Stack.Screen name="mainnet-transfer-preview" options={{ headerShown: false }} />
      <Stack.Screen name="mainnet-secure-confirm" options={{ headerShown: false }} />
      <Stack.Screen name="mainnet-replacement-review" options={{ headerShown: false }} />
      <Stack.Screen name="mainnet-swap" options={{ headerShown: false }} />
      <Stack.Screen name="canonical-migration-review" options={{ title: 'Storage Optimization Review' }} />
      <Stack.Screen name="canonical-migration-review-fixture" options={{ title: 'Write-Free Review Fixture' }} />
      <Stack.Screen name="identity-transition" options={{ title: 'Update Wallet Identity' }} />
      <Stack.Screen name="retired-wallet-cleanup" options={{ title: 'Retired Wallet Cleanup' }} />
      <Stack.Screen name="retired-wallet-cleanup-audit" options={{ title: 'Cleanup Safety Audit' }} />
      <Stack.Screen name="retired-wallet-cleanup-execution" options={{ title: 'Verified Cleanup Execution' }} />
      <Stack.Screen name="identity-transition-fixture" options={{ title: 'Physical Test Fixture' }} />
      <Stack.Screen name="transaction-review" options={{ title: 'Transaction Review' }} />
      <Stack.Screen name="transaction-confirm" options={{ title: 'Confirm Transfer' }} />
    </Stack>
  );
}
