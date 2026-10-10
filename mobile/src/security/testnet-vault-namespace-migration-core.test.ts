import { describe, expect, it, vi } from 'vitest';

import { migrateLegacyTestnetNamespace } from './testnet-vault-namespace-migration-core';

const equal = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);

describe('Testnet vault namespace migration executor', () => {
  it('copies and verifies Testnet records without accepting deletion dependencies', async () => {
    const target = { vault: null as unknown, identity: null as unknown };
    const result = await migrateLegacyTestnetNamespace({
      readLegacyVault: async () => ({ encrypted: 'vault' }),
      readLegacyIdentity: async () => ({ address: '0x1234' }),
      writeTestnetVault: async (value) => { target.vault = value; },
      writeTestnetIdentity: async (value) => { target.identity = value; },
      readTestnetVault: async () => target.vault as { encrypted: string },
      readTestnetIdentity: async () => target.identity as { address: string },
    }, equal);
    expect(result).toEqual({ migrated: true, legacyDeletionPermitted: false });
  });

  it('fails closed when a required legacy record is unavailable', async () => {
    await expect(migrateLegacyTestnetNamespace({
      readLegacyVault: async () => null,
      readLegacyIdentity: async () => ({ address: '0x1234' }),
      writeTestnetVault: vi.fn(), writeTestnetIdentity: vi.fn(),
      readTestnetVault: async () => null,
      readTestnetIdentity: async () => null,
    }, equal)).rejects.toThrow('requires complete legacy vault records');
  });
});
