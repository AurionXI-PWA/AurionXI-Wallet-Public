export type TestnetNamespaceMigrationDependencies<TVault, TIdentity> = {
  readLegacyVault: () => Promise<TVault | null>;
  readLegacyIdentity: () => Promise<TIdentity | null>;
  writeTestnetVault: (value: TVault) => Promise<void>;
  writeTestnetIdentity: (value: TIdentity) => Promise<void>;
  readTestnetVault: () => Promise<TVault | null>;
  readTestnetIdentity: () => Promise<TIdentity | null>;
};

export type TestnetNamespaceMigrationResult = {
  migrated: boolean;
  legacyDeletionPermitted: false;
};

/**
 * Copies only the existing Testnet vault and identity records to the Testnet
 * namespace and verifies each read-back value. Biometric key metadata is
 * intentionally excluded: protected wrapping keys are device-bound and must
 * be re-enrolled after the PIN-authorized migration. No Mainnet dependency or
 * delete callback is accepted by this executor.
 */
export async function migrateLegacyTestnetNamespace<TVault, TIdentity>(
  dependencies: TestnetNamespaceMigrationDependencies<TVault, TIdentity>,
  equal: (left: unknown, right: unknown) => boolean,
): Promise<TestnetNamespaceMigrationResult> {
  const [vault, identity] = await Promise.all([
    dependencies.readLegacyVault(),
    dependencies.readLegacyIdentity(),
  ]);
  if (!vault || !identity) {
    throw new Error('Testnet namespace migration requires complete legacy vault records.');
  }

  await dependencies.writeTestnetVault(vault);
  await dependencies.writeTestnetIdentity(identity);

  const [storedVault, storedIdentity] = await Promise.all([
    dependencies.readTestnetVault(),
    dependencies.readTestnetIdentity(),
  ]);
  if (
    !equal(vault, storedVault)
    || !equal(identity, storedIdentity)
  ) {
    throw new Error('Testnet namespace migration read-back verification failed.');
  }
  return { migrated: true, legacyDeletionPermitted: false };
}
