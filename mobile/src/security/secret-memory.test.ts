import { describe, expect, it, vi } from 'vitest';

import { withZeroizedBytes, zeroizeBytes } from './secret-memory';

describe('best-effort secret memory cleanup', () => {
  it('overwrites a mutable byte buffer', () => {
    const secret = new Uint8Array([1, 2, 3]);
    zeroizeBytes(secret);
    expect([...secret]).toEqual([0, 0, 0]);
  });

  it('overwrites decrypted bytes after successful use', async () => {
    const secret = new Uint8Array([4, 5, 6]);
    await expect(withZeroizedBytes(async () => secret, (value) => value[0])).resolves.toBe(4);
    expect([...secret]).toEqual([0, 0, 0]);
  });

  it('overwrites decrypted bytes when the consumer throws', async () => {
    const secret = new Uint8Array([7, 8, 9]);
    const consumer = vi.fn(() => { throw new Error('consumer failed'); });
    await expect(withZeroizedBytes(async () => secret, consumer)).rejects.toThrow('consumer failed');
    expect([...secret]).toEqual([0, 0, 0]);
  });
});
