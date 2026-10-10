import { describe, expect, it, vi } from 'vitest';

import { withScopedSignedTestnetPayload } from './testnet-signed-payload-lifecycle';

describe('Testnet signed payload lifecycle', () => {
  it('derives a canonical hash and scopes the serialized payload to one callback', async () => {
    const consume = vi.fn().mockResolvedValue('handled');
    await expect(withScopedSignedTestnetPayload({ serializedTransaction: '0x01', consume })).resolves.toBe('handled');
    expect(consume).toHaveBeenCalledWith(expect.objectContaining({ hash: expect.stringMatching(/^0x[0-9a-f]{64}$/), serializedTransaction: '0x01' }));
  });
});
