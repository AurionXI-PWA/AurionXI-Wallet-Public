import {
  AESSealedData,
  AESEncryptionKey,
  aesDecryptAsync,
  aesEncryptAsync,
} from 'expo-crypto';

import type { EncryptedVaultEnvelope } from './vault-store';

const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_HEX_PATTERN = /^[a-f0-9]{64}$/;
const SALT_HEX_PATTERN = /^[a-f0-9]{32}$/;

function base64ToBytes(value: string): Uint8Array {
  try {
    const decoded = globalThis.atob(value);
    return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
  } catch {
    throw new VaultCryptographyError('The encrypted vault encoding is invalid.');
  }
}

export type VaultMetadata = Pick<EncryptedVaultEnvelope, 'createdAt' | 'publicAddress'> & {
  saltHex: string;
};

export class VaultCryptographyError extends Error {
  constructor(message = 'The encrypted wallet vault could not be authenticated.') {
    super(message);
    this.name = 'VaultCryptographyError';
  }
}

function authenticatedMetadata(metadata: VaultMetadata): Uint8Array {
  return new TextEncoder().encode(
    JSON.stringify({
      createdAt: metadata.createdAt,
      format: 'aurionxi-vault-v2',
      publicAddress: metadata.publicAddress.toLowerCase(),
      saltHex: metadata.saltHex,
    })
  );
}

function validateInputs(derivedKeyHex: string, metadata: VaultMetadata): void {
  if (!KEY_HEX_PATTERN.test(derivedKeyHex)) {
    throw new VaultCryptographyError('The derived vault key is invalid.');
  }
  if (!SALT_HEX_PATTERN.test(metadata.saltHex)) {
    throw new VaultCryptographyError('The vault KDF salt is invalid.');
  }
  if (!/^0x[a-fA-F0-9]{40}$/.test(metadata.publicAddress)) {
    throw new VaultCryptographyError('The public wallet address is invalid.');
  }
  if (Number.isNaN(Date.parse(metadata.createdAt))) {
    throw new VaultCryptographyError('The vault creation time is invalid.');
  }
}

export async function encryptVaultPayload(
  plaintext: Uint8Array,
  derivedKeyHex: string,
  metadata: VaultMetadata
): Promise<EncryptedVaultEnvelope> {
  validateInputs(derivedKeyHex, metadata);
  if (plaintext.length === 0) throw new VaultCryptographyError('The vault payload is empty.');

  const key = await AESEncryptionKey.import(derivedKeyHex, 'hex');
  const sealed = await aesEncryptAsync(plaintext, key, {
    additionalData: authenticatedMetadata(metadata),
    nonce: { length: IV_BYTES },
    tagLength: TAG_BYTES,
  });

  return {
    ciphertext: await sealed.combined('base64'),
    createdAt: metadata.createdAt,
    format: 'aurionxi-vault-v2',
    kdf: { algorithm: 'argon2id', saltHex: metadata.saltHex },
    publicAddress: metadata.publicAddress,
  };
}

export async function decryptVaultPayload(
  envelope: EncryptedVaultEnvelope,
  derivedKeyHex: string
): Promise<Uint8Array> {
  const metadata: VaultMetadata = {
    createdAt: envelope.createdAt,
    publicAddress: envelope.publicAddress,
    saltHex: envelope.kdf.saltHex,
  };
  validateInputs(derivedKeyHex, metadata);

  try {
    const key = await AESEncryptionKey.import(derivedKeyHex, 'hex');
    const sealed = AESSealedData.fromCombined(base64ToBytes(envelope.ciphertext), {
      ivLength: IV_BYTES,
      tagLength: TAG_BYTES,
    });
    return await aesDecryptAsync(sealed, key, {
      additionalData: authenticatedMetadata(metadata),
      output: 'bytes',
    });
  } catch {
    throw new VaultCryptographyError();
  }
}
