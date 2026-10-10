import { zeroizeBytes } from './secret-memory';

const SYNTHETIC_PREVIEW_PAYLOAD = new TextEncoder().encode('aurionxi-pin-security-preview-v1');

export type SyntheticVaultReplacementEligibility =
  | { eligible: true }
  | { eligible: false; reason: 'empty-payload' | 'payload-mismatch' };

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return difference === 0;
}

/**
 * This guard intentionally recognizes only the legacy, non-secret synthetic
 * preview payload. All other decrypted vault material is rejected without
 * exposing its contents, so a real or unknown wallet can never be replaced by
 * this Testnet-only migration path.
 */
export function assessSyntheticVaultReplacementEligibility(
  verifiedPayload: Uint8Array,
): SyntheticVaultReplacementEligibility {
  try {
    if (verifiedPayload.length === 0) return { eligible: false, reason: 'empty-payload' };
    return equalBytes(verifiedPayload, SYNTHETIC_PREVIEW_PAYLOAD)
      ? { eligible: true }
      : { eligible: false, reason: 'payload-mismatch' };
  } finally {
    zeroizeBytes(verifiedPayload);
  }
}
