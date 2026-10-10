import type { PinRetryGate } from './pin-retry-state';

export type VaultUnlockGateDependencies = {
  authenticate: (pin: string) => Promise<Uint8Array>;
  clearRetryState: () => Promise<void>;
  getRetryGate: (now: number) => Promise<PinRetryGate>;
  isAuthenticationFailure: (error: unknown) => boolean;
  registerFailure: (now: number) => Promise<PinRetryGate>;
};

export class PinRetryBlockedError extends Error {
  constructor(
    readonly retryAfterMs: number,
    readonly reason: 'cooldown' | 'clock-rollback'
  ) {
    super('PIN entry is temporarily locked.');
    this.name = 'PinRetryBlockedError';
  }
}

export class InvalidVaultPinError extends Error {
  constructor() {
    super('The PIN is incorrect or the vault cannot be authenticated.');
    this.name = 'InvalidVaultPinError';
  }
}

export async function unlockWithPinRetry(
  pin: string,
  dependencies: VaultUnlockGateDependencies,
  now = Date.now()
): Promise<Uint8Array> {
  const gate = await dependencies.getRetryGate(now);
  if (!gate.allowed) throw new PinRetryBlockedError(gate.retryAfterMs, gate.reason);

  try {
    const plaintext = await dependencies.authenticate(pin);
    // A successful authentication must clear persisted failures before the
    // caller is allowed to transition the session to unlocked.
    await dependencies.clearRetryState();
    return plaintext;
  } catch (error) {
    if (!dependencies.isAuthenticationFailure(error)) throw error;
    await dependencies.registerFailure(now);
    throw new InvalidVaultPinError();
  }
}
