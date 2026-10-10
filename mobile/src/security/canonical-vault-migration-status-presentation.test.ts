import { describe, expect, it } from 'vitest';

import type { CanonicalVaultMigrationStartupDecision } from './canonical-vault-migration-startup-policy';
import { getCanonicalVaultMigrationStatusPresentation } from './canonical-vault-migration-status-presentation';

const cases: readonly (readonly [
  CanonicalVaultMigrationStartupDecision,
  string,
  CanonicalVaultMigrationStatusPresentationExpectation,
])[] = [
  [
    { action: 'await-explicit-start', migrationAction: 'record-intent', state: 'ready' },
    'Wallet storage optimization available',
    { blocksWallet: false, requiresUserAction: true, severity: 'information' },
  ],
  [
    { action: 'recover-one-safe-step', migrationAction: 'write-primary-copy', state: 'recoverable' },
    'Wallet security recovery ready',
    { blocksWallet: false, requiresUserAction: false, severity: 'information' },
  ],
  [
    { action: 'require-explicit-candidate-removal', migrationAction: 'remove-candidate', state: 'approval-required' },
    'Secure cleanup approval required',
    { blocksWallet: false, requiresUserAction: true, severity: 'warning' },
  ],
  [
    { action: 'report-complete', state: 'finalized' },
    'Wallet storage secured',
    { blocksWallet: false, requiresUserAction: false, severity: 'success' },
  ],
  [
    { action: 'report-locked', state: 'inconsistent' },
    'Wallet storage transition locked',
    { blocksWallet: true, requiresUserAction: false, severity: 'critical' },
  ],
];

type CanonicalVaultMigrationStatusPresentationExpectation = {
  blocksWallet: boolean;
  requiresUserAction: boolean;
  severity: 'information' | 'warning' | 'critical' | 'success';
};

describe('canonical migration English status presentation foundation', () => {
  it.each(cases)('maps %s to a stable UI-safe status', (decision, title, expected) => {
    const presentation = getCanonicalVaultMigrationStatusPresentation(decision);
    expect(presentation).toEqual(expect.objectContaining({ title, ...expected }));
    expect(presentation.body.length).toBeGreaterThan(20);
  });

  it('does not expose secrets, identifiers, storage keys, or internal phases', () => {
    for (const [decision] of cases) {
      const text = Object.values(getCanonicalVaultMigrationStatusPresentation(decision)).join(' ');
      expect(text).not.toMatch(/private key|recovery phrase|seed|mnemonic|PIN|ciphertext|0x[a-f0-9]{40}/i);
      expect(text).not.toMatch(/transaction|intent-recorded|primary-written|candidate-removed|SecureStore/i);
    }
  });

  it('requires user action only at explicit start and irreversible cleanup boundaries', () => {
    const userActions = cases
      .map(([decision]) => [decision.action, getCanonicalVaultMigrationStatusPresentation(decision)] as const)
      .filter(([, presentation]) => presentation.requiresUserAction)
      .map(([action]) => action);
    expect(userActions).toEqual(['await-explicit-start', 'require-explicit-candidate-removal']);
  });
});
