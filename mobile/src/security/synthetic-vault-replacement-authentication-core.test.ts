import { describe, expect, it, vi } from 'vitest';

import { authenticateSyntheticVaultReplacement } from './synthetic-vault-replacement-authentication-core';

describe('synthetic vault replacement authentication', () => {
  it('accepts the exact legacy preview only after supplied-PIN unlock', async () => {
    const unlockWithPin = vi.fn().mockResolvedValue(new TextEncoder().encode('aurionxi-pin-security-preview-v1'));
    await expect(authenticateSyntheticVaultReplacement('123456', { unlockWithPin })).resolves.toEqual({ eligible: true });
    expect(unlockWithPin).toHaveBeenCalledWith('123456');
  });

  it('keeps a mismatched decrypted vault blocked', async () => {
    await expect(authenticateSyntheticVaultReplacement('123456', {
      unlockWithPin: vi.fn().mockResolvedValue(new Uint8Array([9])),
    })).resolves.toEqual({ eligible: false, reason: 'payload-mismatch' });
  });

  it('propagates a PIN authentication failure without treating it as eligible', async () => {
    await expect(authenticateSyntheticVaultReplacement('000000', {
      unlockWithPin: vi.fn().mockRejectedValue(new Error('invalid PIN')),
    })).rejects.toThrow('invalid PIN');
  });
});
