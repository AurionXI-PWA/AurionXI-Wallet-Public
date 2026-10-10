import { describe, expect, it, vi } from 'vitest';
import { waitForMainnetUnlockHost } from './mainnet-unlock-host-core';

describe('Android unlock host readiness', () => {
  it('waits for resumed/window-focused state after the first biometric prompt detaches', async () => {
    const read = vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true);
    let time = 0;
    await waitForMainnetUnlockHost(read, () => true, () => time, async () => { time += 80; });
    expect(read).toHaveBeenCalledTimes(2);
  });
  it('does not query a host for an already retired/background attempt', async () => {
    const read = vi.fn().mockResolvedValue(true);
    await expect(waitForMainnetUnlockHost(read, () => false)).rejects.toThrow();
    expect(read).not.toHaveBeenCalled();
  });
  it('rejects a late ready result after cancellation', async () => {
    let current = true;
    await expect(waitForMainnetUnlockHost(async () => { current = false; return true; }, () => current)).rejects.toThrow();
  });
  it('bounds the resume wait without weakening authentication or spinning forever', async () => {
    let time = 0;
    const read = vi.fn().mockResolvedValue(false);
    await expect(waitForMainnetUnlockHost(read, () => true, () => time, async () => { time += 500; })).rejects.toThrow();
    expect(time).toBe(2_000);
    expect(read).toHaveBeenCalledTimes(4);
  });
});
