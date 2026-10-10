import { describe, expect, it } from 'vitest';

import { getCanonicalVaultMigrationWriteFreeFixtureDependencies } from './canonical-vault-migration-write-free-fixture-dependencies';

describe('canonical migration write-free fixture dependencies', () => {
  it('returns a fixed unavailable read without a snapshot or authentication', async () => {
    const dependencies = getCanonicalVaultMigrationWriteFreeFixtureDependencies('unavailable');
    await expect(dependencies.loadEligibleSnapshot()).rejects.toThrow('Synthetic fixture storage safety check is unavailable.');
    await expect(dependencies.authenticatePin('123456', new AbortController().signal)).rejects.toThrow(
      'Synthetic fixture does not authenticate PIN.',
    );
  });

  it('keeps loading pending without resolving a snapshot', async () => {
    const pending = getCanonicalVaultMigrationWriteFreeFixtureDependencies('loading').loadEligibleSnapshot();
    let settled = false;
    void pending.then(() => { settled = true; }, () => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);
  });
});
