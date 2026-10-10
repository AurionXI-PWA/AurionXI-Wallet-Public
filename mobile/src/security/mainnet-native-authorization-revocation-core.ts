export type NativeMainnetAuthorizationInvalidator = Readonly<{
  invalidateAuthorizations?: () => void | Promise<void>;
}>;

/** Testable, fail-closed native-authorization revocation adapter. */
export async function revokeNativeMainnetAuthorizations(nativeModule: NativeMainnetAuthorizationInvalidator | undefined): Promise<void> {
  await nativeModule?.invalidateAuthorizations?.();
}
