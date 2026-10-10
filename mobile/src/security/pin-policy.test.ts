import { describe, expect, it } from 'vitest';

import {
  AUTO_LOCK_MS,
  getPinRetryDelayMs,
  shouldAutoLock,
  validatePin,
} from './pin-policy';

describe('PIN policy', () => {
  it('requires six non-trivial digits and matching confirmation', () => {
    expect(validatePin('1234').ok).toBe(false);
    expect(validatePin('111111').ok).toBe(false);
    expect(validatePin('123456').ok).toBe(false);
    expect(validatePin('482905', '482906').ok).toBe(false);
    expect(validatePin('482905', '482905')).toEqual({ ok: true });
  });

  it('increases retry delay after repeated failures', () => {
    expect(getPinRetryDelayMs(4)).toBe(0);
    expect(getPinRetryDelayMs(5)).toBe(30_000);
    expect(getPinRetryDelayMs(7)).toBe(300_000);
    expect(getPinRetryDelayMs(8)).toBe(900_000);
  });

  it('locks after two minutes of inactivity', () => {
    expect(shouldAutoLock(1_000, 1_000 + AUTO_LOCK_MS - 1)).toBe(false);
    expect(shouldAutoLock(1_000, 1_000 + AUTO_LOCK_MS)).toBe(true);
  });
});
