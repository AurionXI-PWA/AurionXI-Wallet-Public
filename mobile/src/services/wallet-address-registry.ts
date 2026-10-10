import { appCheckRequestHeaders, getFirebaseAppCheckToken } from './firebase-app-check';
import type { WalletRegistryOrigin } from '@/storage/wallet-address-registry-consent';

export const WALLET_REGISTRY_CONSENT_VERSION = 'wallet-public-address-registry-v1';
const URL = 'https://asia-south1-aurionxi.cloudfunctions.net/walletAddressRegistry';

async function request(action: 'register' | 'withdraw', publicAddress: string, origin: WalletRegistryOrigin) {
  const token = await getFirebaseAppCheckToken();
  if (!token) throw new Error('Official app verification is unavailable. Try again later.');
  const response = await fetch(URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...appCheckRequestHeaders(token) },
    body: JSON.stringify({ action, publicAddress, origin, consentVersion: WALLET_REGISTRY_CONSENT_VERSION }),
  });
  if (!response.ok) throw new Error('Public address registration is temporarily unavailable.');
  return response.json() as Promise<{ registered: boolean }>;
}

export const registerPublicWalletAddress = (address: string, origin: WalletRegistryOrigin) => request('register', address, origin);
export const withdrawPublicWalletAddress = (address: string, origin: WalletRegistryOrigin) => request('withdraw', address, origin);
