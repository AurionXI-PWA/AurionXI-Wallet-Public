import { zeroizeBytes } from './secret-memory';
import { WALLET_KEY_POLICY } from './wallet-key-policy';

const MAGIC = Uint8Array.from([0x41, 0x52, 0x58, 0x49]); // ARXI
const FORMAT_VERSION = 1;
const ENGLISH_WORDLIST_ID = 1;
const HEADER_BYTES = 27;
const VALID_ENTROPY_LENGTHS = Object.freeze([16, 20, 24, 28, 32] as const);

export type DecodedRecoveryVaultPayload = {
  entropy: Uint8Array;
  formatVersion: 1;
};

function validEntropyLength(length: number): boolean {
  return VALID_ENTROPY_LENGTHS.includes(length as (typeof VALID_ENTROPY_LENGTHS)[number]);
}

export function encodeRecoveryVaultPayload(entropy: Uint8Array): Uint8Array {
  if (!validEntropyLength(entropy.length)) throw new Error('Recovery entropy length is invalid.');
  const payload = new Uint8Array(HEADER_BYTES + entropy.length);
  payload.set(MAGIC, 0);
  payload[4] = FORMAT_VERSION;
  payload[5] = ENGLISH_WORDLIST_ID;
  payload[6] = entropy.length;
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  view.setUint32(7, WALLET_KEY_POLICY.purpose);
  view.setUint32(11, WALLET_KEY_POLICY.coinType);
  view.setUint32(15, WALLET_KEY_POLICY.accountIndex);
  view.setUint32(19, WALLET_KEY_POLICY.changeIndex);
  view.setUint32(23, WALLET_KEY_POLICY.addressIndex);
  payload.set(entropy, HEADER_BYTES);
  return payload;
}

export function decodeRecoveryVaultPayload(payload: Uint8Array): DecodedRecoveryVaultPayload {
  if (payload.length < HEADER_BYTES || !MAGIC.every((byte, index) => payload[index] === byte)) {
    throw new Error('Recovery vault payload is invalid.');
  }
  const entropyLength = payload[6] ?? 0;
  if (
    payload[4] !== FORMAT_VERSION ||
    payload[5] !== ENGLISH_WORDLIST_ID ||
    !validEntropyLength(entropyLength) ||
    payload.length !== HEADER_BYTES + entropyLength
  ) {
    throw new Error('Recovery vault payload is invalid.');
  }
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  if (
    view.getUint32(7) !== WALLET_KEY_POLICY.purpose ||
    view.getUint32(11) !== WALLET_KEY_POLICY.coinType ||
    view.getUint32(15) !== WALLET_KEY_POLICY.accountIndex ||
    view.getUint32(19) !== WALLET_KEY_POLICY.changeIndex ||
    view.getUint32(23) !== WALLET_KEY_POLICY.addressIndex
  ) {
    throw new Error('Recovery vault derivation policy is incompatible.');
  }
  return {
    entropy: payload.slice(HEADER_BYTES),
    formatVersion: 1,
  };
}

export function withEncodedRecoveryVaultPayload<T>(
  entropy: Uint8Array,
  consumer: (payload: Uint8Array) => T,
): T {
  const payload = encodeRecoveryVaultPayload(entropy);
  try {
    return consumer(payload);
  } finally {
    zeroizeBytes(payload);
  }
}

export async function withEncodedRecoveryVaultPayloadAsync<T>(
  entropy: Uint8Array,
  consumer: (payload: Uint8Array) => Promise<T>,
): Promise<T> {
  const payload = encodeRecoveryVaultPayload(entropy);
  try {
    return await consumer(payload);
  } finally {
    zeroizeBytes(payload);
  }
}
