import { ABORT_AWARE_PIN_VERIFIER_CANCELLED_MESSAGE } from './abort-aware-pin-verifier-adapter-core';
import type { CanonicalVaultMigrationSnapshot } from './canonical-vault-migration-policy';

type LoadEligibleSnapshot = (signal?: AbortSignal) => Promise<CanonicalVaultMigrationSnapshot>;
type AuthenticatePin = (pin: string, signal: AbortSignal) => Promise<void>;

export function canonicalVaultMigrationSnapshotsHaveSameStartScope(
  loaded: CanonicalVaultMigrationSnapshot,
  fresh: CanonicalVaultMigrationSnapshot,
): boolean {
  return !!loaded.candidate && !!fresh.candidate &&
    !!loaded.replacementJournal && !!fresh.replacementJournal &&
    loaded.candidate.publicAddress.toLowerCase() === fresh.candidate.publicAddress.toLowerCase() &&
    loaded.candidate.createdAt === fresh.candidate.createdAt &&
    loaded.replacementJournal.transactionId === fresh.replacementJournal.transactionId &&
    loaded.activeSlot?.transactionId === fresh.activeSlot?.transactionId;
}

export async function recheckCanonicalVaultMigrationSnapshotScope(
  loadedSnapshot: CanonicalVaultMigrationSnapshot,
  loadEligibleSnapshot: LoadEligibleSnapshot,
  signal?: AbortSignal,
): Promise<void> {
  const freshSnapshot = await loadEligibleSnapshot(signal);
  if (!canonicalVaultMigrationSnapshotsHaveSameStartScope(loadedSnapshot, freshSnapshot)) {
    throw new Error('Wallet storage optimization eligibility changed.');
  }
}

export function createFreshSnapshotCanonicalVaultMigrationPinVerifier(
  loadedSnapshot: CanonicalVaultMigrationSnapshot,
  loadEligibleSnapshot: LoadEligibleSnapshot,
  authenticatePin: AuthenticatePin,
): AuthenticatePin {
  return async (pin, signal) => {
    if (signal.aborted) throw new Error(ABORT_AWARE_PIN_VERIFIER_CANCELLED_MESSAGE);
    const freshSnapshot = await loadEligibleSnapshot(signal);
    if (signal.aborted) throw new Error(ABORT_AWARE_PIN_VERIFIER_CANCELLED_MESSAGE);
    if (!canonicalVaultMigrationSnapshotsHaveSameStartScope(loadedSnapshot, freshSnapshot)) {
      throw new Error('Wallet storage optimization eligibility changed.');
    }
    await authenticatePin(pin, signal);
    if (signal.aborted) throw new Error(ABORT_AWARE_PIN_VERIFIER_CANCELLED_MESSAGE);
    const postPinSnapshot = await loadEligibleSnapshot(signal);
    if (signal.aborted) throw new Error(ABORT_AWARE_PIN_VERIFIER_CANCELLED_MESSAGE);
    if (!canonicalVaultMigrationSnapshotsHaveSameStartScope(loadedSnapshot, postPinSnapshot)) {
      throw new Error('Wallet storage optimization eligibility changed after PIN verification.');
    }
  };
}
