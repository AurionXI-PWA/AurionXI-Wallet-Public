import { describe, expect, it } from 'vitest';

import { createVaultNetworkMigrationPlan } from './vault-network-migration-plan';

describe('vault network migration plan', () => {
  it('can plan a verified Testnet copy without deleting legacy data', () => {
    const plan = createVaultNetworkMigrationPlan({ target: 'bsc-testnet', targetAlreadyInitialized: false });
    expect(plan.action).toBe('copy-testnet-legacy-after-verification');
    expect(plan.sourceKeys).toContain('aurionxi.wallet.vault.v3');
    expect(plan.permitsLegacyDeletion).toBe(false);
  });

  it('never copies a Testnet vault into the Mainnet namespace', () => {
    const plan = createVaultNetworkMigrationPlan({ target: 'bsc-mainnet', targetAlreadyInitialized: false });
    expect(plan).toMatchObject({
      action: 'create-empty-mainnet-namespace',
      sourceKeys: [],
      requiresFreshPinVerification: true,
      requiresReadBackVerification: true,
      permitsLegacyDeletion: false,
    });
  });

  it('does not overwrite an initialized target', () => {
    expect(createVaultNetworkMigrationPlan({ target: 'bsc-mainnet', targetAlreadyInitialized: true }).action)
      .toBe('no-action');
  });
});
