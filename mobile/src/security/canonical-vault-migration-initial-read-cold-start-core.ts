export function isCanonicalVaultMigrationInitialReadAppActive(
  appState: string | null,
): boolean {
  return appState === 'active';
}
