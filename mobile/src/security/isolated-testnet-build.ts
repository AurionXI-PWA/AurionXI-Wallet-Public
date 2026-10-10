export const ISOLATED_TESTNET_VERSION_SUFFIX = '-isolated-testnet';

export function isIsolatedTestnetBuild(nativeAppVersion: string | null | undefined): boolean {
  return nativeAppVersion?.endsWith(ISOLATED_TESTNET_VERSION_SUFFIX) === true;
}
