import { describe, expect, it, vi } from 'vitest';

import { encodeRecoveryVaultPayload } from './recovery-vault-payload';
import { withTestnetSignerFromVaultPayload } from './testnet-scoped-signer-core';

const address = '0x1111111111111111111111111111111111111111' as const;

describe('Testnet scoped signer core', () => {
  it('creates a signer only for the callback and wipes payload ownership afterwards', async () => {
    const payload = encodeRecoveryVaultPayload(new Uint8Array(32).fill(7));
    const deriveSigner = vi.fn().mockReturnValue({ address, signTransaction: vi.fn() });
    await expect(withTestnetSignerFromVaultPayload({ payload, deriveSigner, consume: async (signer) => signer.address })).resolves.toBe(address);
    expect(deriveSigner).toHaveBeenCalledOnce();
    expect([...payload].every((byte) => byte === 0)).toBe(true);
  });

  it('wipes owned payload even if signer derivation fails', async () => {
    const payload = encodeRecoveryVaultPayload(new Uint8Array(32).fill(3));
    await expect(withTestnetSignerFromVaultPayload({ payload, deriveSigner: () => { throw new Error('derivation failure'); }, consume: async () => undefined })).rejects.toThrow('derivation failure');
    expect([...payload].every((byte) => byte === 0)).toBe(true);
  });
});
