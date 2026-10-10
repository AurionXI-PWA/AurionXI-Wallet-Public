import {
  assessSyntheticVaultReplacementEligibility,
  type SyntheticVaultReplacementEligibility,
} from './synthetic-vault-replacement-eligibility';

export type SyntheticVaultReplacementAuthenticationDependencies = {
  unlockWithPin: (pin: string) => Promise<Uint8Array>;
};

/**
 * Authenticates the current vault before replacement. The only successful
 * result is the exact historical preview payload; all other vaults remain
 * authoritative and are blocked from this narrow migration route.
 */
export async function authenticateSyntheticVaultReplacement(
  pin: string,
  dependencies: SyntheticVaultReplacementAuthenticationDependencies,
): Promise<SyntheticVaultReplacementEligibility> {
  const plaintext = await dependencies.unlockWithPin(pin);
  return assessSyntheticVaultReplacementEligibility(plaintext);
}
