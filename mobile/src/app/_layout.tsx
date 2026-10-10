import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { SessionLockProvider } from '@/security/session-lock-provider';
import { CanonicalVaultMigrationStatusProvider } from '@/security/canonical-vault-migration-status-provider';
import { VaultIdentityIntegrityProvider } from '@/security/vault-identity-integrity-provider';
import { VaultReplacementRecoveryProvider } from '@/security/vault-replacement-recovery-provider';
import { WalletOnboardingProvider } from '@/security/wallet-onboarding-provider';
import { TestnetSendFlowProvider } from '@/security/testnet-send-flow-provider';
import { MainnetOnboardingProvider } from '@/security/mainnet-onboarding-provider';
import { MainnetSendFlowProvider } from '@/security/mainnet-send-flow-provider';
import { MainnetSessionLockProvider } from '@/security/mainnet-session-lock-provider';

export default function RootLayout() {
  return (
    <SessionLockProvider>
      <CanonicalVaultMigrationStatusProvider>
        <VaultReplacementRecoveryProvider>
          <VaultIdentityIntegrityProvider>
            <WalletOnboardingProvider>
              <MainnetSessionLockProvider>
              <MainnetOnboardingProvider>
              <MainnetSendFlowProvider>
                <TestnetSendFlowProvider>
                  <Stack screenOptions={{ headerShown: false }}>
                    <Stack.Screen name="index" />
                    <Stack.Screen name="wallet" />
                  </Stack>
                  <StatusBar style="light" />
                </TestnetSendFlowProvider>
              </MainnetSendFlowProvider>
              </MainnetOnboardingProvider>
              </MainnetSessionLockProvider>
            </WalletOnboardingProvider>
          </VaultIdentityIntegrityProvider>
        </VaultReplacementRecoveryProvider>
      </CanonicalVaultMigrationStatusProvider>
    </SessionLockProvider>
  );
}
