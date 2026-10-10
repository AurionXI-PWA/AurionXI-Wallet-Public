import { CanonicalVaultMigrationRealPinLoadedStartScreenHarness } from '@/components/canonical-vault-migration-real-pin-loaded-start-screen-harness';
import { useSensitiveScreenProtection } from '@/security/use-sensitive-screen-protection';

export default function CanonicalMigrationReviewScreen() {
  useSensitiveScreenProtection();
  return <CanonicalVaultMigrationRealPinLoadedStartScreenHarness />;
}
