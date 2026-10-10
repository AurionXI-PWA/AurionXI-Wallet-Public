export type BiometricIntegritySnapshot = {
  envelopeKeyId: string | null;
  trackedKeyIds: string[];
};

export type BiometricIntegrityAudit = {
  biometricUnlockAllowed: boolean;
  orphanedKeyIds: string[];
  state: 'not-configured' | 'consistent' | 'missing-tracking' | 'orphaned-keys';
};

export function auditBiometricIntegrity(
  snapshot: BiometricIntegritySnapshot,
): BiometricIntegrityAudit {
  const uniqueTracked = [...new Set(snapshot.trackedKeyIds)].filter((keyId) =>
    /^[a-f0-9]{32}$/.test(keyId),
  );
  const orphanedKeyIds = uniqueTracked.filter((keyId) => keyId !== snapshot.envelopeKeyId);

  if (!snapshot.envelopeKeyId) {
    return {
      biometricUnlockAllowed: false,
      orphanedKeyIds,
      state: orphanedKeyIds.length > 0 ? 'orphaned-keys' : 'not-configured',
    };
  }
  if (!uniqueTracked.includes(snapshot.envelopeKeyId)) {
    return {
      biometricUnlockAllowed: false,
      orphanedKeyIds,
      state: 'missing-tracking',
    };
  }
  return {
    biometricUnlockAllowed: true,
    orphanedKeyIds,
    state: orphanedKeyIds.length > 0 ? 'orphaned-keys' : 'consistent',
  };
}
