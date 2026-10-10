import { NativeModules, Platform } from 'react-native';

import { revokeNativeMainnetAuthorizations, type NativeMainnetAuthorizationInvalidator } from './mainnet-native-authorization-revocation-core';

export { revokeNativeMainnetAuthorizations, type NativeMainnetAuthorizationInvalidator } from './mainnet-native-authorization-revocation-core';

/** The bridge exposes revocation only—never issue, consume, signing, or secrets. */
export function invalidateNativeMainnetAuthorizations(): Promise<void> {
  if (Platform.OS !== 'android') return Promise.resolve();
  const nativeModule = NativeModules.AurionXIMainnetSecurity as NativeMainnetAuthorizationInvalidator | undefined;
  return revokeNativeMainnetAuthorizations(nativeModule);
}
