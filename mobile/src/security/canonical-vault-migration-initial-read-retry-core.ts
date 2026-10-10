export type CanonicalVaultMigrationInitialReadRetryGate = {
  invalidate: () => void;
};

export type CanonicalVaultMigrationInitialReadRetryState = {
  readSequence: number;
  loaderState: { isRetrying: true; status: 'loading' };
};

export function getCanonicalVaultMigrationInitialReadRetryState(
  attemptGate: CanonicalVaultMigrationInitialReadRetryGate,
  readSequence: number,
): CanonicalVaultMigrationInitialReadRetryState {
  attemptGate.invalidate();
  return {
    loaderState: { isRetrying: true, status: 'loading' },
    readSequence: readSequence + 1,
  };
}
