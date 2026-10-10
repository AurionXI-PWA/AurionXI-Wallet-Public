import { type Href, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  getBiometricCapability,
  type BiometricCapability,
} from '@/security/biometric-capability';
import { auditStoredBiometricIntegrity } from '@/security/biometric-integrity';
import type { BiometricIntegrityAudit } from '@/security/biometric-integrity-core';
import { readActiveVaultV3OrNull } from '@/security/vault-active-resolver';

type CapabilityState = BiometricCapability | 'checking' | 'error';

export function BiometricStatusCard() {
  const router = useRouter();
  const [capability, setCapability] = useState<CapabilityState>('checking');
  const [configured, setConfigured] = useState(false);
  const [integrity, setIntegrity] = useState<BiometricIntegrityAudit['state']>('not-configured');

  useEffect(() => {
    let active = true;
    void Promise.all([getBiometricCapability(), auditStoredBiometricIntegrity(), readActiveVaultV3OrNull()])
      .then(([result, audit, resolution]) => {
        if (active) {
          setCapability(result);
          setConfigured(!!resolution?.vault.biometric);
          setIntegrity(audit.state);
        }
      })
      .catch(() => {
        if (active) setCapability('error');
      });
    return () => {
      active = false;
    };
  }, []);

  const status = useMemo(() => {
    if (integrity === 'missing-tracking') {
      return 'Biometric storage needs recovery. Use PIN, then re-enroll or disable biometrics.';
    }
    if (integrity === 'orphaned-keys') {
      return configured
        ? 'Biometric unlock is enabled. Deferred protected-key cleanup is pending.'
        : 'Deferred biometric key cleanup is pending. PIN remains available.';
    }
    if (configured) return 'Biometric unlock is enabled. PIN remains your recovery fallback.';
    if (capability === 'checking') return 'Checking device capability…';
    if (capability === 'error') return 'Biometric capability could not be verified.';
    if (capability.status === 'unavailable') return 'No biometric hardware is available.';
    if (capability.status === 'not-enrolled') return 'Set up device biometrics before opt-in can be considered.';
    if (capability.status === 'weak-only') return 'Only weak biometric security is enrolled. PIN remains required.';
    const methods = capability.modalities.join(' and ') || 'biometric authentication';
    return `Strong ${methods} detected. PIN remains required in this build.`;
  }, [capability, configured, integrity]);

  const disabled = !configured && (
    capability === 'checking' || capability === 'error' || !capability.canOfferOptIn
  );

  return (
    <View style={styles.card}>
      <Text style={styles.eyebrow}>BIOMETRIC UNLOCK</Text>
      <Text accessibilityLiveRegion="polite" style={styles.status}>{status}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={() => router.push('/wallet/biometric' as Href)}
        style={({ pressed }) => [styles.button, disabled && styles.disabledButton, pressed && styles.pressed]}>
        <Text style={styles.disabledText}>
          {configured
            ? 'Manage biometric unlock'
            : capability !== 'checking' && capability !== 'error' && capability.canOfferOptIn
            ? 'PIN-first opt-in pending'
            : 'Biometric opt-in unavailable'}
        </Text>
      </Pressable>
      <Text style={styles.footnote}>
        Detection does not open a biometric prompt, store consent, or bypass the PIN. PIN fallback
        remains mandatory.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#0b1e18',
    borderColor: '#2f5145',
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 18,
    padding: 16,
  },
  eyebrow: { color: '#7cf6bd', fontSize: 11, fontWeight: '900', letterSpacing: 1.4 },
  status: { color: '#dff8eb', fontSize: 14, lineHeight: 21, marginTop: 9 },
  button: {
    alignItems: 'center',
    borderColor: '#466459',
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 14,
    paddingVertical: 12,
  },
  disabledButton: { opacity: 0.5 },
  disabledText: { color: '#9eb2a9', fontSize: 13, fontWeight: '800' },
  pressed: { opacity: 0.75 },
  footnote: { color: '#71877e', fontSize: 11, lineHeight: 17, marginTop: 10 },
});
