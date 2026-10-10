import {
  AESSealedData,
  AESEncryptionKey,
  aesDecryptAsync,
  aesEncryptAsync,
} from 'expo-crypto';

import type { VaultV3Metadata } from './vault-envelope-v3';
import { VaultCryptographyError } from './vault-crypto';

const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_HEX_PATTERN = /^[a-f0-9]{64}$/;
type AesPurpose = 'payload' | 'pin-wrap' | `biometric-wrap:${string}`;

function hexToBytes(value: string): Uint8Array {
  if (!KEY_HEX_PATTERN.test(value)) throw new VaultCryptographyError('The vault key is invalid.');
  return Uint8Array.from(value.match(/.{2}/g) ?? [], (byte) => Number.parseInt(byte, 16));
}

function bytesToHex(value: Uint8Array): string {
  return Array.from(value, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function base64ToBytes(value: string): Uint8Array {
  try {
    const decoded = globalThis.atob(value);
    return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
  } catch {
    throw new VaultCryptographyError('The encrypted vault encoding is invalid.');
  }
}

function additionalData(metadata: VaultV3Metadata, purpose: AesPurpose): Uint8Array {
  if (!/^0x[a-fA-F0-9]{40}$/.test(metadata.publicAddress) || Number.isNaN(Date.parse(metadata.createdAt))) {
    throw new VaultCryptographyError('The authenticated vault metadata is invalid.');
  }
  return new TextEncoder().encode(JSON.stringify({
    createdAt: metadata.createdAt,
    format: 'aurionxi-vault-v3',
    publicAddress: metadata.publicAddress.toLowerCase(),
    purpose,
  }));
}

async function seal(
  plaintext: Uint8Array,
  keyHex: string,
  metadata: VaultV3Metadata,
  purpose: AesPurpose,
): Promise<string> {
  if (plaintext.length === 0) throw new VaultCryptographyError('The encrypted input is empty.');
  const key = await AESEncryptionKey.import(keyHex, 'hex');
  const sealed = await aesEncryptAsync(plaintext, key, {
    additionalData: additionalData(metadata, purpose),
    nonce: { length: IV_BYTES },
    tagLength: TAG_BYTES,
  });
  return sealed.combined('base64');
}

async function open(
  ciphertext: string,
  keyHex: string,
  metadata: VaultV3Metadata,
  purpose: AesPurpose,
): Promise<Uint8Array> {
  if (!KEY_HEX_PATTERN.test(keyHex)) throw new VaultCryptographyError('The vault key is invalid.');
  try {
    const key = await AESEncryptionKey.import(keyHex, 'hex');
    const sealed = AESSealedData.fromCombined(base64ToBytes(ciphertext), {
      ivLength: IV_BYTES,
      tagLength: TAG_BYTES,
    });
    return await aesDecryptAsync(sealed, key, {
      additionalData: additionalData(metadata, purpose),
      output: 'bytes',
    });
  } catch {
    throw new VaultCryptographyError();
  }
}

export function encryptVaultV3Payload(payload: Uint8Array, vaultKeyHex: string, metadata: VaultV3Metadata) {
  return seal(payload, vaultKeyHex, metadata, 'payload');
}

export function decryptVaultV3Payload(ciphertext: string, vaultKeyHex: string, metadata: VaultV3Metadata) {
  return open(ciphertext, vaultKeyHex, metadata, 'payload');
}

export function wrapVaultKeyForPin(vaultKeyHex: string, wrappingKeyHex: string, metadata: VaultV3Metadata) {
  return seal(hexToBytes(vaultKeyHex), wrappingKeyHex, metadata, 'pin-wrap');
}

export async function unwrapVaultKeyForPin(
  wrappedVaultKey: string,
  wrappingKeyHex: string,
  metadata: VaultV3Metadata,
): Promise<string> {
  const bytes = await open(wrappedVaultKey, wrappingKeyHex, metadata, 'pin-wrap');
  if (bytes.length !== 32) throw new VaultCryptographyError('The unwrapped vault key is invalid.');
  return bytesToHex(bytes);
}

export function wrapVaultKeyForBiometric(
  vaultKeyHex: string,
  wrappingKeyHex: string,
  metadata: VaultV3Metadata,
  keyId: string,
) {
  if (!/^[a-f0-9]{32}$/.test(keyId)) throw new VaultCryptographyError('The biometric key reference is invalid.');
  return seal(hexToBytes(vaultKeyHex), wrappingKeyHex, metadata, `biometric-wrap:${keyId}`);
}

export async function unwrapVaultKeyForBiometric(
  wrappedVaultKey: string,
  wrappingKeyHex: string,
  metadata: VaultV3Metadata,
  keyId: string,
): Promise<string> {
  if (!/^[a-f0-9]{32}$/.test(keyId)) throw new VaultCryptographyError('The biometric key reference is invalid.');
  const bytes = await open(wrappedVaultKey, wrappingKeyHex, metadata, `biometric-wrap:${keyId}`);
  if (bytes.length !== 32) throw new VaultCryptographyError('The unwrapped vault key is invalid.');
  return bytesToHex(bytes);
}
