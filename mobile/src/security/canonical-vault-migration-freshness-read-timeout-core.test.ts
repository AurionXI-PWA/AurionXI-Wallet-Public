import { describe, expect, it, vi } from 'vitest';

import {
  CANONICAL_VAULT_MIGRATION_FRESHNESS_READ_TIMEOUT_MESSAGE,
  readCanonicalVaultMigrationFreshnessWithTimeout,
} from './canonical-vault-migration-freshness-read-timeout-core';

function setup() {
  let fireTimer: (() => void) | undefined;
  const clearTimer = vi.fn();
  const setTimer = vi.fn().mockImplementation((callback: () => void) => {
    fireTimer = callback;
    return 9 as unknown as ReturnType<typeof setTimeout>;
  });
  return {
    clearTimer,
    dependencies: { clearTimer, setTimer },
    fireTimer: () => fireTimer?.(),
    setTimer,
  };
}

describe('canonical migration freshness read timeout foundation', () => {
  it('uses the requested bounded timeout and returns an early read', async () => {
    const test = setup();
    await expect(readCanonicalVaultMigrationFreshnessWithTimeout(
      vi.fn().mockResolvedValue('snapshot'),
      5_000,
      test.dependencies,
    )).resolves.toBe('snapshot');
    expect(test.setTimer).toHaveBeenCalledWith(expect.any(Function), 5_000);
    expect(test.clearTimer).toHaveBeenCalledWith(9);
  });

  it('fails closed when a read never settles', async () => {
    const test = setup();
    const pending = readCanonicalVaultMigrationFreshnessWithTimeout(
      () => new Promise<string>(() => undefined),
      5_000,
      test.dependencies,
    );
    test.fireTimer();
    await expect(pending).rejects.toThrow(CANONICAL_VAULT_MIGRATION_FRESHNESS_READ_TIMEOUT_MESSAGE);
  });

  it('ignores completion after timeout', async () => {
    const test = setup();
    let resolveRead: ((value: string) => void) | undefined;
    const pending = readCanonicalVaultMigrationFreshnessWithTimeout(
      () => new Promise<string>((resolve) => { resolveRead = resolve; }),
      5_000,
      test.dependencies,
    );
    test.fireTimer();
    resolveRead?.('late snapshot');
    await expect(pending).rejects.toThrow('timed out');
  });

  it('propagates an early read rejection and clears the timer', async () => {
    const test = setup();
    await expect(readCanonicalVaultMigrationFreshnessWithTimeout(
      vi.fn().mockRejectedValue(new Error('read failed')),
      5_000,
      test.dependencies,
    )).rejects.toThrow('read failed');
    expect(test.clearTimer).toHaveBeenCalledWith(9);
  });

  it('cancels and clears the timer immediately on lifecycle abort', async () => {
    const test = setup();
    const abortController = new AbortController();
    const pending = readCanonicalVaultMigrationFreshnessWithTimeout(
      () => new Promise<string>(() => undefined),
      5_000,
      test.dependencies,
      abortController.signal,
    );
    abortController.abort();
    await expect(pending).rejects.toThrow('cancelled');
    expect(test.clearTimer).toHaveBeenCalledWith(9);
  });
});
