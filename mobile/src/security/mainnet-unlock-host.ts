import { NativeModules, Platform } from 'react-native';
import { waitForMainnetUnlockHost } from './mainnet-unlock-host-core';

type WalletAuthenticationHost = { isWalletAuthenticationHostReady?: () => Promise<boolean> };

/** Public lifecycle check only: never reads a PIN, vault, key or signed bytes. */
export async function requireMainnetUnlockHostReady(isCurrent: () => boolean): Promise<void> {
  if (!isCurrent()) throw new Error('The wallet unlock attempt was cancelled.');
  if (Platform.OS !== 'android') throw new Error('Mainnet wallet unlock requires Android.');
  const host = NativeModules.AurionXIMainnetSecurity as WalletAuthenticationHost | undefined;
  if (!host?.isWalletAuthenticationHostReady) throw new Error('Wallet authentication lifecycle check is unavailable.');
  await waitForMainnetUnlockHost(() => host.isWalletAuthenticationHostReady!(), isCurrent);
}
