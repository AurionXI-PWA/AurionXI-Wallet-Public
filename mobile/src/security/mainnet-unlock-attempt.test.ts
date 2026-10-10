import { describe, expect, it } from 'vitest';
import { MAINNET_UNLOCK_ATTEMPT_TIMEOUT_MS, MainnetUnlockAttemptGate, MainnetUnlockAutoPromptGate } from './mainnet-unlock-attempt';

describe('Mainnet unlock attempt lifetime', () => {
  it('does not begin while backgrounded/unfocused and blocks duplicate taps synchronously', () => {
    const gate = new MainnetUnlockAttemptGate();
    expect(gate.begin(false, 100)).toBeUndefined();
    expect(gate.begin(true, 100)).toBeDefined();
    expect(gate.begin(true, 101)).toBeUndefined();
  });
  it('rejects late success after background or blur, even after returning', () => {
    const gate = new MainnetUnlockAttemptGate();
    const old = gate.begin(true, 100)!;
    expect(gate.retire()).toBe(true);
    const fresh = gate.begin(true, 200)!;
    expect(gate.isCurrent(old, 201)).toBe(false);
    expect(gate.isCurrent(fresh, 201)).toBe(true);
    expect(gate.retire(old)).toBe(false);
    expect(gate.isCurrent(fresh, 202)).toBe(true);
  });
  it('rejects success at the deadline and allows PIN retry after retiring a stuck biometric', () => {
    const gate = new MainnetUnlockAttemptGate();
    const old = gate.begin(true, 100)!;
    expect(gate.isCurrent(old, 100 + MAINNET_UNLOCK_ATTEMPT_TIMEOUT_MS - 1)).toBe(true);
    expect(gate.isCurrent(old, 100 + MAINNET_UNLOCK_ATTEMPT_TIMEOUT_MS)).toBe(false);
    expect(gate.retire(old)).toBe(true);
    const retry = gate.begin(true, 100 + MAINNET_UNLOCK_ATTEMPT_TIMEOUT_MS)!;
    expect(gate.isCurrent(old, 101 + MAINNET_UNLOCK_ATTEMPT_TIMEOUT_MS)).toBe(false);
    expect(gate.isCurrent(retry, 101 + MAINNET_UNLOCK_ATTEMPT_TIMEOUT_MS)).toBe(true);
  });
});

describe('foreground-gated automatic wallet biometric', () => {
  it('waits for foreground/focus rather than starting on a background mount', () => {
    const gate = new MainnetUnlockAutoPromptGate();
    expect(gate.offer(false, false)).toBe(false);
    expect(gate.offer(true, false)).toBe(true);
  });
  it('does not reopen after cancellation, blur/return or a transient inactive prompt state', () => {
    const gate = new MainnetUnlockAutoPromptGate();
    expect(gate.offer(true, false)).toBe(true);
    expect(gate.offer(false, false)).toBe(false);
    expect(gate.offer(true, false)).toBe(false);
  });
  it('never overlaps an active attempt or overrides explicit PIN choice', () => {
    const gate = new MainnetUnlockAutoPromptGate();
    expect(gate.offer(true, true)).toBe(false);
    gate.suppress();
    expect(gate.offer(true, false)).toBe(false);
  });
});
