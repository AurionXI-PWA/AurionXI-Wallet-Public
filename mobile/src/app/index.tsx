import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { getMainnetVaultV3Status, type VaultStatus } from '@/security/vault-store';

/** A new device starts with wallet setup, while existing owners open their wallet dashboard. */
export default function WalletLaunchScreen() {
  const [vaultStatus, setVaultStatus] = useState<VaultStatus | 'loading'>('loading');

  useEffect(() => {
    let active = true;
    void getMainnetVaultV3Status()
      .then((status) => active && setVaultStatus(status))
      .catch(() => active && setVaultStatus('unsupported'));
    return () => { active = false; };
  }, []);

  if (vaultStatus === 'loading') {
    return <View accessibilityLabel="Checking wallet status" style={styles.loading}><ActivityIndicator color="#67b5ff" /></View>;
  }

  return <Redirect href={(vaultStatus === 'present' ? '/wallet/mainnet-readonly' : '/wallet/mainnet-onboarding') as never} />;
}

const styles = StyleSheet.create({
  loading: { alignItems: 'center', backgroundColor: '#04091b', flex: 1, justifyContent: 'center' },
});
