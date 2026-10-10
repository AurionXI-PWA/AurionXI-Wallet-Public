import { Redirect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { WALLET_SECRET_FEATURE } from '@/config/network';
import { validatePin } from '@/security/pin-policy';
import { getPinRetryGate } from '@/security/pin-retry-store';
import { useSessionLock } from '@/security/session-lock-provider';
import { useSensitiveScreenProtection } from '@/security/use-sensitive-screen-protection';
import { useVaultIdentityIntegrity } from '@/security/vault-identity-integrity-provider';
import {
  InvalidVaultPinError,
  PinRetryBlockedError,
} from '@/security/vault-unlock-gate';
import { createActiveTestnetRecoveryVault } from '@/security/active-recovery-vault-create';
import { unlockEncryptedVaultWithRetry } from '@/security/vault-workflow';
import { zeroizeBytes } from '@/security/secret-memory';
import { getActiveVaultStatus } from '@/security/vault-active-identity-snapshot';
import type { VaultStatus } from '@/security/vault-store';
import { useWalletOnboarding } from '@/security/wallet-onboarding-provider';
import { canAccessWalletOnboardingRoute } from '@/security/wallet-onboarding-machine';

function formatCountdown(milliseconds: number): string {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1_000));
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return minutes > 0 ? `${minutes}:${remainder.toString().padStart(2, '0')}` : `${remainder}s`;
}

export default function PinProtectionScreen() {
  useSensitiveScreenProtection();
  const router = useRouter();
  const { state } = useWalletOnboarding();
  const { unlock } = useSessionLock();
  const { refresh: refreshIdentityIntegrity } = useVaultIdentityIntegrity();
  const [status, setStatus] = useState<VaultStatus | 'loading'>('loading');
  const [pin, setPin] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [blockedUntil, setBlockedUntil] = useState(0);
  const [now, setNow] = useState(0);
  const mounted = useRef(true);

  const refreshGate = useCallback(async () => {
    const checkedAt = Date.now();
    const gate = await getPinRetryGate(checkedAt);
    if (mounted.current) {
      setNow(checkedAt);
      setBlockedUntil(gate.allowed ? 0 : gate.blockedUntil);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void (async () => {
      try {
        const nextStatus = await getActiveVaultStatus();
        if (!mounted.current) return;
        setStatus(nextStatus);
        if (nextStatus === 'present') await refreshGate();
      } catch {
        if (mounted.current) setStatus('unsupported');
      }
    })();
    return () => {
      mounted.current = false;
    };
  }, [refreshGate]);

  useEffect(() => {
    if (blockedUntil <= Date.now()) return;
    const timer = setInterval(() => {
      const nextNow = Date.now();
      setNow(nextNow);
      if (nextNow >= blockedUntil) setBlockedUntil(0);
    }, 250);
    return () => clearInterval(timer);
  }, [blockedUntil]);

  const retryAfterMs = Math.max(0, blockedUntil - now);
  const blocked = retryAfterMs > 0;
  const setupMode = status === 'empty';
  const canSubmit =
    authenticated ||
    (!busy && !blocked && pin.length === 6 && (!setupMode || confirmation.length === 6));

  const title = useMemo(() => {
    if (status === 'loading') return 'Checking secure storage';
    if (authenticated) return 'Testnet wallet unlocked';
    if (setupMode) return 'Create your security PIN';
    if (status === 'present') return 'Unlock security preview';
    return 'Secure storage unavailable';
  }, [authenticated, setupMode, status]);

  async function submit() {
    let plaintext: Uint8Array | undefined;
    if (authenticated) {
      router.replace('/wallet/testnet-dashboard' as never);
      return;
    }
    setError(null);
    setMessage(null);
    const validation = validatePin(pin, setupMode ? confirmation : undefined);
    if (!validation.ok) {
      setError(validation.message);
      return;
    }

    setBusy(true);
    try {
      if (setupMode) {
        if (!state.recoveryVerified || (state.flow !== 'create' && state.flow !== 'import')) {
          throw new Error('Verified recovery material is required before secure wallet setup.');
        }
        await createActiveTestnetRecoveryVault(pin, confirmation);
        await refreshIdentityIntegrity();
        if (!mounted.current) return;
        setStatus('present');
        setAuthenticated(true);
        unlock();
        setMessage(state.flow === 'import'
          ? 'Testnet wallet recovered and secured. Your recovery phrase remains your offline backup.'
          : 'Testnet wallet identity secured. Your recovery phrase remains your offline backup.');
      } else {
        plaintext = await unlockEncryptedVaultWithRetry(pin);
        if (plaintext.length === 0) throw new Error('Unexpected vault payload.');
        if (!mounted.current) return;
        setBlockedUntil(0);
        setAuthenticated(true);
        unlock();
        setMessage(
          WALLET_SECRET_FEATURE.enabled
            ? 'Testnet wallet unlocked successfully. Sending requires a fresh review, PIN confirmation, and separate broadcast confirmation.'
            : 'Security preview unlocked successfully.',
        );
      }
    } catch (caught) {
      if (!mounted.current) return;
      if (caught instanceof PinRetryBlockedError) {
        setBlockedUntil(Date.now() + caught.retryAfterMs);
        setNow(Date.now());
        setError('Too many attempts. PIN entry is temporarily locked.');
      } else if (caught instanceof InvalidVaultPinError) {
        setError('Incorrect PIN. Try again.');
        await refreshGate();
      } else {
        setError('Secure PIN operation failed. Nothing was unlocked.');
      }
    } finally {
      zeroizeBytes(plaintext);
      if (mounted.current) {
        setPin('');
        setConfirmation('');
        setBusy(false);
      }
    }
  }

  if (
    status !== 'loading' &&
    status !== 'present' &&
    !canAccessWalletOnboardingRoute(state, 'pin-setup')
  ) {
    return <Redirect href="/wallet" />;
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.keyboard}>
        <View style={styles.content}>
          <Text style={styles.protected}>SCREEN CAPTURE BLOCKED</Text>
          <Text accessibilityRole="header" style={styles.title}>{title}</Text>
          <Text style={styles.body}>
            {authenticated
              ? 'Your encrypted BSC Testnet wallet is ready for this active session. Sending requires a fresh review, PIN confirmation, and separate broadcast confirmation.'
              : setupMode
              ? 'Choose a six-digit PIN. It encrypts this BSC Testnet wallet on this device.'
              : 'Enter your six-digit PIN to unlock encrypted local wallet storage.'}
          </Text>

          {status === 'loading' ? <ActivityIndicator color="#7cf6bd" size="large" style={styles.loader} /> : null}

          {(setupMode || status === 'present') ? (
            <View style={styles.form}>
              {!authenticated ? (
                <>
                  <Text style={styles.label}>{setupMode ? 'New PIN' : 'PIN'}</Text>
                  <TextInput
                    accessibilityLabel={setupMode ? 'New six-digit PIN' : 'Six-digit PIN'}
                    autoComplete="off"
                    editable={!busy && !blocked}
                    keyboardType="number-pad"
                    maxLength={6}
                    onChangeText={(value) => setPin(value.replace(/\D/g, ''))}
                    placeholder="••••••"
                    placeholderTextColor="#52685f"
                    secureTextEntry
                    style={styles.input}
                    value={pin}
                  />
                  {setupMode ? (
                    <>
                      <Text style={styles.label}>Confirm PIN</Text>
                      <TextInput
                        accessibilityLabel="Confirm six-digit PIN"
                        autoComplete="off"
                        editable={!busy}
                        keyboardType="number-pad"
                        maxLength={6}
                        onChangeText={(value) => setConfirmation(value.replace(/\D/g, ''))}
                        placeholder="••••••"
                        placeholderTextColor="#52685f"
                        secureTextEntry
                        style={styles.input}
                        value={confirmation}
                      />
                    </>
                  ) : null}
                  {blocked ? (
                    <View accessibilityLiveRegion="polite" accessibilityRole="alert" style={styles.warning}>
                      <Text style={styles.warningTitle}>Try again in {formatCountdown(retryAfterMs)}</Text>
                      <Text style={styles.warningBody}>The cooldown remains active if the app is restarted.</Text>
                    </View>
                  ) : null}
                  {error ? <Text accessibilityLiveRegion="assertive" accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
                </>
              ) : null}
              {message ? <Text accessibilityLiveRegion="polite" style={styles.success}>{message}</Text> : null}

              <Pressable
                accessibilityRole="button"
                disabled={!canSubmit}
                onPress={() => void submit()}
                style={({ pressed }) => [styles.primary, !canSubmit && styles.disabled, pressed && styles.pressed]}>
                {busy ? (
                  <ActivityIndicator color="#062015" />
                ) : (
                  <Text style={styles.primaryText}>
                    {authenticated ? 'Continue' : setupMode ? 'Create PIN' : 'Unlock'}
                  </Text>
                )}
              </Pressable>
            </View>
          ) : null}

          {status === 'corrupt' ? (
            <View accessibilityRole="alert" style={styles.warning}>
              <Text style={styles.warningTitle}>Encrypted vault validation failed</Text>
              <Text style={styles.warningBody}>The app failed closed. Existing data was not changed.</Text>
            </View>
          ) : null}
          {status === 'unsupported' ? (
            <View accessibilityRole="alert" style={styles.warning}>
              <Text style={styles.warningTitle}>Secure device storage is required</Text>
              <Text style={styles.warningBody}>PIN setup is unavailable on this device.</Text>
            </View>
          ) : null}

          <Text style={styles.footnote}>BSC Testnet only. No mainnet signing or transaction broadcast is enabled.</Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#050b1d' },
  keyboard: { flex: 1 },
  content: { flex: 1, padding: 24, justifyContent: 'center' },
  protected: { color: '#76baff', fontSize: 11, fontWeight: '900', letterSpacing: 1.6 },
  title: { color: '#f6fbf8', fontSize: 30, fontWeight: '800', marginTop: 12 },
  body: { color: '#b5c8e8', fontSize: 15, lineHeight: 23, marginTop: 12 },
  loader: { marginTop: 28 },
  form: { marginTop: 22 },
  label: { color: '#dcecff', fontSize: 13, fontWeight: '800', marginBottom: 8, marginTop: 12 },
  input: { backgroundColor: '#0a1732', borderColor: '#315ca3', borderWidth: 1, borderRadius: 14, color: '#f6fbf8', fontSize: 24, letterSpacing: 8, paddingHorizontal: 18, paddingVertical: 14 },
  warning: { backgroundColor: '#251d0d', borderColor: '#745b22', borderWidth: 1, borderRadius: 14, padding: 14, marginTop: 16 },
  warningTitle: { color: '#ffe39a', fontSize: 14, fontWeight: '800' },
  warningBody: { color: '#cdbd91', fontSize: 12, lineHeight: 18, marginTop: 4 },
  error: { color: '#ffaaa0', fontSize: 13, lineHeight: 19, marginTop: 14 },
  success: { color: '#7cf6bd', fontSize: 13, lineHeight: 19, marginTop: 14 },
  primary: { backgroundColor: '#287cf5', borderRadius: 14, alignItems: 'center', minHeight: 52, justifyContent: 'center', marginTop: 20 },
  primaryText: { color: '#f7fbff', fontSize: 15, fontWeight: '900' },
  disabled: { opacity: 0.4 },
  pressed: { opacity: 0.78 },
  footnote: { color: '#71877e', fontSize: 11, lineHeight: 17, marginTop: 22 },
});
