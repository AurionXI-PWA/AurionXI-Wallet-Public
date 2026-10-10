export const PIN_LENGTH = 6;
export const AUTO_LOCK_MS = 2 * 60 * 1_000;

const SIMPLE_SEQUENCES = new Set([
  '012345',
  '123456',
  '234567',
  '345678',
  '456789',
  '987654',
  '876543',
  '765432',
  '654321',
  '543210',
]);

export type PinValidation =
  | { ok: true }
  | { ok: false; message: string };

export function validatePin(pin: string, confirmation?: string): PinValidation {
  if (!new RegExp(`^\\d{${PIN_LENGTH}}$`).test(pin)) {
    return { ok: false, message: 'PIN must contain exactly 6 digits.' };
  }
  if (/^(\d)\1+$/.test(pin) || SIMPLE_SEQUENCES.has(pin)) {
    return { ok: false, message: 'Choose a PIN that is harder to guess.' };
  }
  if (confirmation !== undefined && pin !== confirmation) {
    return { ok: false, message: 'PINs do not match.' };
  }
  return { ok: true };
}

export function getPinRetryDelayMs(failedAttempts: number): number {
  if (failedAttempts < 5) return 0;
  if (failedAttempts === 5) return 30_000;
  if (failedAttempts === 6) return 60_000;
  if (failedAttempts === 7) return 5 * 60_000;
  return 15 * 60_000;
}

export function shouldAutoLock(lastActiveAt: number, now = Date.now()): boolean {
  return now - lastActiveAt >= AUTO_LOCK_MS;
}
