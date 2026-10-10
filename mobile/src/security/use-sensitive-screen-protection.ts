import { usePreventScreenCapture } from 'expo-screen-capture';

const SENSITIVE_SCREEN_KEY = 'aurionxi-wallet-secrets';

export function useSensitiveScreenProtection() {
  usePreventScreenCapture(SENSITIVE_SCREEN_KEY);
}
