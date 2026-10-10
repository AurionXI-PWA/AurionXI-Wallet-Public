import { resolveActiveVault } from './vault-active-resolver-core';
import { readVaultActiveSlot } from './vault-active-slot-store';
import { readVaultReplacementJournal } from './vault-replacement-journal-store';
import { readVaultV3, readVaultV3Candidate } from './vault-store';

export async function readActiveVaultV3OrNull() {
  const activeSlot = await readVaultActiveSlot();
  if (!activeSlot || activeSlot.activeSlot === 'primary') {
    const primary = await readVaultV3();
    if (!primary) return null;
    return resolveActiveVault(activeSlot, primary, null, null);
  }
  const [candidate, journal] = await Promise.all([
    readVaultV3Candidate(),
    readVaultReplacementJournal(),
  ]);
  return resolveActiveVault(activeSlot, null, candidate, journal);
}

export async function readActiveVaultV3() {
  const resolution = await readActiveVaultV3OrNull();
  if (!resolution) throw new Error('An active v3 wallet is required.');
  return resolution;
}
