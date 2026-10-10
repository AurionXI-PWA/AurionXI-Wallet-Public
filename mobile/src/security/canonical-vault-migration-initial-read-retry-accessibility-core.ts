export type CanonicalVaultMigrationInitialReadRetryAccessibility = {
  accessibilityHint: string;
  accessibilityLabel: string;
  accessibilityState: { busy: boolean; disabled: boolean };
  actionText: string;
};

const READY: CanonicalVaultMigrationInitialReadRetryAccessibility = {
  accessibilityHint: 'Checks the latest local wallet storage state again.',
  accessibilityLabel: 'Retry wallet storage safety check',
  accessibilityState: { busy: false, disabled: false },
  actionText: 'Retry safety check',
};

const BUSY: CanonicalVaultMigrationInitialReadRetryAccessibility = {
  accessibilityHint: 'Wallet storage safety check is in progress.',
  accessibilityLabel: 'Wallet storage safety check in progress',
  accessibilityState: { busy: true, disabled: true },
  actionText: 'Safety check in progress',
};

export function getCanonicalVaultMigrationInitialReadRetryAccessibility(
  isRetrying: boolean,
): CanonicalVaultMigrationInitialReadRetryAccessibility {
  return isRetrying ? BUSY : READY;
}
