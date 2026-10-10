import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { EncryptedVaultEnvelope } from './vault-store';
import type { VaultV3Envelope } from './vault-envelope-v3';
import {
  migrateV2ToV3Atomically,
  type VaultV3MigrationDependencies,
} from './vault-v3-migration-core';

const legacy = { format: 'aurionxi-vault-v2' } as EncryptedVaultEnvelope;
const migrated = { format: 'aurionxi-vault-v3' } as VaultV3Envelope;
const plaintext = new Uint8Array([1, 2, 3]);
let dependencies: VaultV3MigrationDependencies;

beforeEach(() => {
  dependencies = {
    buildV3: vi.fn().mockResolvedValue(migrated),
    deleteLegacy: vi.fn().mockResolvedValue(undefined),
    deleteV3: vi.fn().mockResolvedValue(undefined),
    decryptLegacy: vi.fn().mockResolvedValue(plaintext),
    readLegacy: vi.fn().mockResolvedValue(legacy),
    readV3: vi.fn().mockResolvedValue(migrated),
    unlockV3: vi.fn().mockResolvedValue(plaintext),
    writeV3: vi.fn().mockResolvedValue(undefined),
  };
});

describe('atomic v2 to v3 migration', () => {
  it('deletes v2 only after persisted v3 read-back and decrypt verification', async () => {
    const events: string[] = [];
    vi.mocked(dependencies.writeV3).mockImplementation(async () => { events.push('writeV3'); });
    vi.mocked(dependencies.readV3).mockImplementation(async () => {
      events.push('readV3');
      return migrated;
    });
    vi.mocked(dependencies.unlockV3).mockImplementation(async () => {
      events.push('unlockV3');
      return plaintext;
    });
    vi.mocked(dependencies.deleteLegacy).mockImplementation(async () => { events.push('deleteLegacy'); });
    await migrateV2ToV3Atomically('482905', dependencies);
    expect(events).toEqual(['writeV3', 'readV3', 'unlockV3', 'deleteLegacy']);
  });

  it('retains v2 and rolls back v3 when verification fails', async () => {
    vi.mocked(dependencies.unlockV3).mockResolvedValue(new Uint8Array([9]));
    await expect(migrateV2ToV3Atomically('482905', dependencies)).rejects.toThrow('failed verification');
    expect(dependencies.deleteLegacy).not.toHaveBeenCalled();
    expect(dependencies.deleteV3).toHaveBeenCalledOnce();
  });

  it('does not touch either stored copy when legacy PIN authentication fails', async () => {
    vi.mocked(dependencies.decryptLegacy).mockRejectedValue(new Error('incorrect PIN'));
    await expect(migrateV2ToV3Atomically('000000', dependencies)).rejects.toThrow('incorrect PIN');
    expect(dependencies.writeV3).not.toHaveBeenCalled();
    expect(dependencies.deleteLegacy).not.toHaveBeenCalled();
    expect(dependencies.deleteV3).not.toHaveBeenCalled();
  });
});
