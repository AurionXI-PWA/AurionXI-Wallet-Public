import { describe, expect, it } from 'vitest';

import {
  evaluatePinRetryGate,
  MAX_PIN_RETRY_DELAY_MS,
  type PinRetryRecord,
  recordPinFailure,
} from './pin-retry-state';

describe('persistent PIN retry state', () => {
  it('allows a first attempt with no record', () => {
    expect(evaluatePinRetryGate(null, 1_000)).toEqual({ allowed: true, failedAttempts: 0 });
  });

  it('persists escalating delays and caps the attempt counter', () => {
    let record: PinRetryRecord | null = null;
    for (let attempt = 1; attempt <= 10; attempt += 1) {
      record = recordPinFailure(record, attempt * 1_000);
    }
    if (!record) throw new Error('Expected a retry record.');
    expect(record.failedAttempts).toBe(8);
    expect(record.blockedUntil - record.lastAttemptAt).toBe(MAX_PIN_RETRY_DELAY_MS);
  });

  it('blocks until the persisted cooldown expires', () => {
    let record: PinRetryRecord | null = null;
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      record = recordPinFailure(record, attempt * 1_000);
    }
    if (!record) throw new Error('Expected a retry record.');
    expect(evaluatePinRetryGate(record, record.lastAttemptAt + 1)).toMatchObject({
      allowed: false,
      reason: 'cooldown',
    });
    expect(evaluatePinRetryGate(record, record.blockedUntil)).toEqual({
      allowed: true,
      failedAttempts: 5,
    });
  });

  it('fails closed for a wall-clock rollback', () => {
    const record = recordPinFailure(null, 10_000);
    expect(evaluatePinRetryGate(record, 9_000)).toEqual({
      allowed: false,
      blockedUntil: 9_000 + MAX_PIN_RETRY_DELAY_MS,
      failedAttempts: 8,
      reason: 'clock-rollback',
      retryAfterMs: MAX_PIN_RETRY_DELAY_MS,
    });
  });
});
