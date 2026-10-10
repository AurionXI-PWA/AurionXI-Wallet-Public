import { getAddress, isAddress, type Address } from 'viem';

export type AddressResult =
  | { ok: true; address: Address }
  | { ok: false; message: string };

export function normalizeAddress(value: string): AddressResult {
  const candidate = value.trim();
  if (!candidate) {
    return { ok: false, message: 'A public BSC address is required.' };
  }
  if (!isAddress(candidate)) {
    return {
      ok: false,
      message: 'This is not a valid 0x EVM address. Never enter a recovery phrase or private key.',
    };
  }
  return { ok: true, address: getAddress(candidate) };
}

export function shortenAddress(address: Address): string {
  return `${address.slice(0, 8)}…${address.slice(-6)}`;
}
