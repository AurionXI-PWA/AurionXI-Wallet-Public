import AsyncStorage from '@react-native-async-storage/async-storage';

export type WalletRegistryOrigin = 'create' | 'import' | 'existing';
export type WalletRegistryConsent = { publicAddress: string; origin: WalletRegistryOrigin; registered: boolean };
const KEY = '@aurionxi/wallet-public-address-registry-consent/v1';

export async function readWalletRegistryConsent(): Promise<WalletRegistryConsent | null> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as WalletRegistryConsent;
    return /^0x[0-9a-fA-F]{40}$/.test(value.publicAddress) ? value : null;
  } catch { return null; }
}

export async function writeWalletRegistryConsent(value: WalletRegistryConsent): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(value));
}

export async function clearWalletRegistryConsent(): Promise<void> { await AsyncStorage.removeItem(KEY); }
