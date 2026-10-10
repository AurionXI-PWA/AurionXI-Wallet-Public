import { describe, expect, it, vi } from 'vitest';

import { generateSyntheticRecoveryBackupProof } from './synthetic-recovery-backup-generation-core';

describe('synthetic non-revealing recovery backup generation', () => {
  it('returns generation metadata without returning phrase content', async () => {
    const entropy = new Uint8Array(32);
    const proof = await generateSyntheticRecoveryBackupProof({
      randomBytes: vi.fn().mockResolvedValue(entropy),
      walletSecretFeatureEnabled: true,
    });

    expect(proof).toEqual({ generated: true, wordCount: 24 });
    expect(JSON.stringify(proof)).not.toContain('abandon');
    expect([...entropy]).toEqual(new Array(32).fill(0));
  });

  it('does not request entropy while the secret feature is disabled', async () => {
    const randomBytes = vi.fn();
    await expect(generateSyntheticRecoveryBackupProof({
      randomBytes,
      walletSecretFeatureEnabled: false,
    })).rejects.toThrow('disabled');
    expect(randomBytes).not.toHaveBeenCalled();
  });
});
