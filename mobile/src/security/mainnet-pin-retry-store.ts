import * as SecureStore from 'expo-secure-store';

import { createPinRetryStore } from './pin-retry-store';

const store = createPinRetryStore('aurionxi.wallet.bsc-mainnet.v1.pin-retry', {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  keychainService: 'com.aurionxi.wallet.bsc-mainnet.v1.pin-retry',
  requireAuthentication: false,
});

export const getMainnetPinRetryGate = store.getGate;
export const registerMainnetPinFailure = store.registerFailure;
export const clearMainnetPinRetryState = store.clear;
