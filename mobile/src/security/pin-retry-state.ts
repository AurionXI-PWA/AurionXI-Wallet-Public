import { getPinRetryDelayMs } from './pin-policy';

export const MAX_PIN_FAILURES = 8;
export const MAX_PIN_RETRY_DELAY_MS = 15 * 60_000;

export type PinRetryRecord = {
  blockedUntil: number;
  failedAttempts: number;
  format: 'aurionxi-pin-retry-v1';
  lastAttemptAt: number;
};

export type PinRetryGate =
  | { allowed: true; failedAttempts: number }
  | {
      allowed: false;
      blockedUntil: number;
      failedAttempts: number;
      reason: 'cooldown' | 'clock-rollback';
      retryAfterMs: number;
    };

export function isPinRetryRecord(value: unknown): value is PinRetryRecord {
  if (!value || typeof value !== 'object') return false;
  const record = value as Partial<PinRetryRecord>;
  return (
    record.format === 'aurionxi-pin-retry-v1' &&
    Number.isInteger(record.failedAttempts) &&
    record.failedAttempts! >= 0 &&
    record.failedAttempts! <= MAX_PIN_FAILURES &&
    Number.isSafeInteger(record.lastAttemptAt) &&
    record.lastAttemptAt! >= 0 &&
    Number.isSafeInteger(record.blockedUntil) &&
    record.blockedUntil! >= record.lastAttemptAt!
  );
}

export function evaluatePinRetryGate(
  record: PinRetryRecord | null,
  now: number
): PinRetryGate {
  if (!record) return { allowed: true, failedAttempts: 0 };
  if (now < record.lastAttemptAt) {
    return {
      allowed: false,
      blockedUntil: now + MAX_PIN_RETRY_DELAY_MS,
      failedAttempts: MAX_PIN_FAILURES,
      reason: 'clock-rollback',
      retryAfterMs: MAX_PIN_RETRY_DELAY_MS,
    };
  }
  if (now < record.blockedUntil) {
    return {
      allowed: false,
      blockedUntil: record.blockedUntil,
      failedAttempts: record.failedAttempts,
      reason: 'cooldown',
      retryAfterMs: record.blockedUntil - now,
    };
  }
  return { allowed: true, failedAttempts: record.failedAttempts };
}

export function recordPinFailure(
  previous: PinRetryRecord | null,
  now: number
): PinRetryRecord {
  const failedAttempts = Math.min((previous?.failedAttempts ?? 0) + 1, MAX_PIN_FAILURES);
  return {
    blockedUntil: now + getPinRetryDelayMs(failedAttempts),
    failedAttempts,
    format: 'aurionxi-pin-retry-v1',
    lastAttemptAt: now,
  };
}
