import { describe, expect, it } from 'vitest';

import { getCanonicalVaultMigrationInitialReadRetryAccessibility } from './canonical-vault-migration-initial-read-retry-accessibility-core';

describe('canonical migration initial freshness retry accessibility', () => {
  it('describes an available retry action for assistive technology', () => {
    expect(getCanonicalVaultMigrationInitialReadRetryAccessibility(false)).toEqual({
      accessibilityHint: 'Checks the latest local wallet storage state again.',
      accessibilityLabel: 'Retry wallet storage safety check',
      accessibilityState: { busy: false, disabled: false },
      actionText: 'Retry safety check',
    });
  });

  it('describes a retry already in progress as busy and disabled', () => {
    expect(getCanonicalVaultMigrationInitialReadRetryAccessibility(true)).toEqual({
      accessibilityHint: 'Wallet storage safety check is in progress.',
      accessibilityLabel: 'Wallet storage safety check in progress',
      accessibilityState: { busy: true, disabled: true },
      actionText: 'Safety check in progress',
    });
  });

  it('contains no storage, PIN, or snapshot data', () => {
    const copy = getCanonicalVaultMigrationInitialReadRetryAccessibility(true);
    expect(JSON.stringify(copy)).not.toMatch(/pin|snapshot|storage path/i);
  });
});
