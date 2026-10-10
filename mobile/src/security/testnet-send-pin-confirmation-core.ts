export type TestnetSendPinConfirmationResult =
  | { ok: true; verifiedAt: number }
  | { ok: false; reason: 'vault-locked' | 'pin-verification-failed' };

/**
 * Produces a timestamp-only outcome for a fresh send confirmation. The PIN,
 * decrypted payload, account, and transaction details are intentionally kept
 * outside this core and are never returned or persisted here.
 */
export async function confirmTestnetSendPinWithDependencies(input: {
  vaultUnlocked: boolean;
  now: number;
  authenticatePin: () => Promise<void>;
}): Promise<TestnetSendPinConfirmationResult> {
  if (!input.vaultUnlocked) return { ok: false, reason: 'vault-locked' };
  try {
    await input.authenticatePin();
    return { ok: true, verifiedAt: input.now };
  } catch {
    return { ok: false, reason: 'pin-verification-failed' };
  }
}
