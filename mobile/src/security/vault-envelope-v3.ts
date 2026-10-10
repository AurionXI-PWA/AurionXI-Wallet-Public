export type VaultV3Metadata = {
  createdAt: string;
  publicAddress: `0x${string}`;
};

export type VaultV3Envelope = VaultV3Metadata & {
  biometric?: {
    keyId: string;
    scheme: 'aes-256-gcm+secure-store-v1';
    wrappedVaultKey: string;
  };
  format: 'aurionxi-vault-v3';
  payloadCiphertext: string;
  pin: {
    algorithm: 'argon2id';
    saltHex: string;
    wrappedVaultKey: string;
  };
};

const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;

function isAuthenticatedCiphertext(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 40 && BASE64_PATTERN.test(value);
}

export function isVaultV3Envelope(value: unknown): value is VaultV3Envelope {
  if (!value || typeof value !== 'object') return false;
  const envelope = value as Partial<VaultV3Envelope>;
  const validBiometricSlot = envelope.biometric === undefined || (
    typeof envelope.biometric === 'object' &&
    /^[a-f0-9]{32}$/.test(envelope.biometric.keyId) &&
    envelope.biometric.scheme === 'aes-256-gcm+secure-store-v1' &&
    isAuthenticatedCiphertext(envelope.biometric.wrappedVaultKey)
  );
  return (
    envelope.format === 'aurionxi-vault-v3' &&
    typeof envelope.publicAddress === 'string' &&
    /^0x[a-fA-F0-9]{40}$/.test(envelope.publicAddress) &&
    typeof envelope.createdAt === 'string' &&
    !Number.isNaN(Date.parse(envelope.createdAt)) &&
    isAuthenticatedCiphertext(envelope.payloadCiphertext) &&
    !!envelope.pin &&
    envelope.pin.algorithm === 'argon2id' &&
    /^[a-f0-9]{32}$/.test(envelope.pin.saltHex) &&
    isAuthenticatedCiphertext(envelope.pin.wrappedVaultKey) &&
    validBiometricSlot
  );
}
