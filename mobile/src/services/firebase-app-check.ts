type AppCheckInstance = unknown;
type AppCheckProvider = {
  configure: (options: { android: { provider: 'debug' | 'playIntegrity' } }) => void;
};
type AppCheckModule = {
  initializeAppCheck: (app: unknown, options: unknown) => AppCheckInstance;
  getToken: (appCheck: AppCheckInstance, forceRefresh: boolean) => Promise<{ token: string }>;
  ReactNativeFirebaseAppCheckProvider: new () => AppCheckProvider;
};

type DirectRecaptchaAppCheckModule = {
  available?: boolean;
  getToken: (forceRefresh: boolean) => Promise<string>;
};

let appCheck: AppCheckInstance | undefined;
let getToken: AppCheckModule['getToken'] | undefined;
let needsInitialTokenRefresh = true;

function isAndroidRuntime(): boolean {
  try {
    // This import must stay lazy: Vitest does not transform React Native's
    // Flow source, while the actual Android runtime provides the module.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('react-native').Platform.OS === 'android';
  } catch {
    return false;
  }
}

function getDirectRecaptchaAppCheckModule(): DirectRecaptchaAppCheckModule | undefined {
  try {
    // Lazy access keeps web and Vitest free of native-module requirements.
    // The bridge reports available only for a configured Direct build.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const nativeModules = require('react-native').NativeModules as {
      AurionXIRecaptchaAppCheck?: DirectRecaptchaAppCheckModule;
    };
    const module = nativeModules.AurionXIRecaptchaAppCheck;
    return module?.available ? module : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Returns a Firebase App Check token only when the native Android SDK has been
 * configured. It deliberately fails closed to an absent token: until rollout
 * enforcement is enabled, the relay's monitor mode continues to work without
 * exposing a debug token or treating App Check as an authentication mechanism.
 */
export async function getFirebaseAppCheckToken(): Promise<string | undefined> {
  if (!isAndroidRuntime()) return undefined;

  try {
    const directRecaptcha = getDirectRecaptchaAppCheckModule();
    if (directRecaptcha) {
      const token = (await directRecaptcha.getToken(needsInitialTokenRefresh)).trim() || undefined;
      if (token) needsInitialTokenRefresh = false;
      return token;
    }

    if (!appCheck) {
      // Lazy native imports keep web/test environments free of Firebase-native
      // initialization requirements.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { getApp } = require('@react-native-firebase/app') as typeof import('@react-native-firebase/app');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const appCheckModule = require('@react-native-firebase/app-check') as AppCheckModule;
      // React Native Firebase requires its native provider to be configured
      // before initialization. Passing only the convenience object can race
      // native setup and cause the first broadcast to omit its token.
      const provider = new appCheckModule.ReactNativeFirebaseAppCheckProvider();
      provider.configure({
        android: { provider: __DEV__ ? 'debug' : 'playIntegrity' },
      });
      appCheck = appCheckModule.initializeAppCheck(getApp(), {
        provider,
        isTokenAutoRefreshEnabled: true,
      });
      getToken = appCheckModule.getToken;
    }

    if (!getToken) return undefined;
    // Force only the first retrieval after provider setup. This avoids using a
    // stale/empty native cache while retaining normal Firebase token caching
    // for later broadcasts.
    const result = await getToken(appCheck, needsInitialTokenRefresh);
    const token = result.token.trim() || undefined;
    if (token) needsInitialTokenRefresh = false;
    return token;
  } catch {
    // Never expose or log a token. Monitor mode fails closed to no header.
    return undefined;
  }
}

export function appCheckRequestHeaders(token: string | undefined): Record<string, string> {
  return token ? { 'X-Firebase-AppCheck': token } : {};
}
