import AsyncStorage from '@react-native-async-storage/async-storage';
import { getAddress, isAddress, type Address } from 'viem';

const WATCHED_ADDRESS_KEY = '@aurionxi/wallet-beta/watched-address/v1';

export async function loadWatchedAddress(): Promise<Address | undefined> {
  const value = await AsyncStorage.getItem(WATCHED_ADDRESS_KEY);
  return value && isAddress(value) ? getAddress(value) : undefined;
}

export async function saveWatchedAddress(address: Address): Promise<void> {
  await AsyncStorage.setItem(WATCHED_ADDRESS_KEY, address);
}

export async function clearWatchedAddress(): Promise<void> {
  await AsyncStorage.removeItem(WATCHED_ADDRESS_KEY);
}
