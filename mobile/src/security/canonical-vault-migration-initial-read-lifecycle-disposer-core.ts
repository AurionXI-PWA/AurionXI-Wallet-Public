export type CanonicalVaultMigrationInitialReadLifecycleDisposer = {
  dispose: () => void;
};

export function createCanonicalVaultMigrationInitialReadLifecycleDisposer(
  removeSubscription: () => void,
): CanonicalVaultMigrationInitialReadLifecycleDisposer {
  let disposed = false;
  return {
    dispose: () => {
      if (disposed) return;
      disposed = true;
      removeSubscription();
    },
  };
}
