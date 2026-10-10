import { describe, expect, it } from 'vitest';

import { getCanonicalVaultMigrationStatusCardModel } from './canonical-vault-migration-status-card-core';
import type { CanonicalVaultMigrationStatusState } from './canonical-vault-migration-status-provider';

describe('canonical migration read-only status card foundation', () => {
  it('provides an accessible checking model without actions', () => {
    expect(getCanonicalVaultMigrationStatusCardModel({ status: 'checking' })).toEqual({
      accessibilityLabel: 'Checking wallet storage safety',
      state: 'checking',
    });
  });

  it.each([
    {
      decision: { action: 'report-complete', state: 'finalized' } as const,
      presentation: {
        blocksWallet: false,
        body: 'The canonical wallet is active and the device-storage transition completed successfully.',
        requiresUserAction: false,
        severity: 'success' as const,
        title: 'Wallet storage secured',
      },
      status: 'ready' as const,
    },
    {
      presentation: {
        blocksWallet: true,
        body: 'Wallet storage safety could not be verified. No automatic wallet change was performed.',
        requiresUserAction: false,
        severity: 'critical' as const,
        title: 'Wallet storage transition locked',
      },
      status: 'error' as const,
    },
  ] satisfies CanonicalVaultMigrationStatusState[])('projects $status provider state without mutation controls', (state) => {
    const model = getCanonicalVaultMigrationStatusCardModel(state);
    expect(model).toEqual(expect.objectContaining({
      body: state.presentation.body,
      state: 'visible',
      title: state.presentation.title,
    }));
    expect(model).not.toHaveProperty('onPress');
    expect(model).not.toHaveProperty('action');
    expect(model).not.toHaveProperty('route');
  });

  it('projects an approval note flag without providing an approval handler', () => {
    const model = getCanonicalVaultMigrationStatusCardModel({
      decision: {
        action: 'require-explicit-candidate-removal',
        migrationAction: 'remove-candidate',
        state: 'approval-required',
      },
      presentation: {
        blocksWallet: false,
        body: 'The canonical wallet is active and verified. Removing the retired temporary copy requires your explicit approval.',
        requiresUserAction: true,
        severity: 'warning',
        title: 'Secure cleanup approval required',
      },
      status: 'ready',
    });
    expect(model).toEqual(expect.objectContaining({ requiresUserAction: true, state: 'visible' }));
    expect(model).not.toHaveProperty('approve');
  });

  it('allows the review route only for the exact eligible explicit-start decision', () => {
    const model = getCanonicalVaultMigrationStatusCardModel({
      decision: {
        action: 'await-explicit-start',
        migrationAction: 'record-intent',
        state: 'ready',
      },
      presentation: {
        blocksWallet: false,
        body: 'Your active wallet is secure. A device-storage optimization is available and will start only with your approval.',
        requiresUserAction: true,
        severity: 'information',
        title: 'Wallet storage optimization available',
      },
      status: 'ready',
    });
    expect(model).toEqual(expect.objectContaining({ canReviewOptimization: true, state: 'visible' }));
  });

  it.each([
    { action: 'report-complete', state: 'finalized' } as const,
    { action: 'recover-one-safe-step', migrationAction: 'mark-finalized', state: 'recoverable' } as const,
    { action: 'require-explicit-candidate-removal', migrationAction: 'remove-candidate', state: 'approval-required' } as const,
    { action: 'report-locked', state: 'inconsistent' } as const,
  ])('does not allow the review route for %s', (decision) => {
    const model = getCanonicalVaultMigrationStatusCardModel({
      decision,
      presentation: {
        blocksWallet: false,
        body: 'Fixed presentation.',
        requiresUserAction: false,
        severity: 'information',
        title: 'Fixed title',
      },
      status: 'ready',
    });
    expect(model).toEqual(expect.objectContaining({ canReviewOptimization: false, state: 'visible' }));
  });
});
