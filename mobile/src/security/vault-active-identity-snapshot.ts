import type { VaultActiveSlotRecord } from './vault-active-slot-core';
import { readActiveVaultV3 } from './vault-active-resolver';
import { readVaultActiveSlot } from './vault-active-slot-store';
import type { VaultV3Envelope } from './vault-envelope-v3';
import { getVaultStatus, readVaultV3, type VaultStatus } from './vault-store';

export type ActiveVaultIdentitySnapshot = {
  slot: 'primary' | 'candidate';
  status: VaultStatus;
  vault: VaultV3Envelope | null;
};

function pointersMatch(
  before: VaultActiveSlotRecord | null,
  after: VaultActiveSlotRecord | null,
): boolean {
  const beforeSlot = before?.activeSlot ?? 'primary';
  const afterSlot = after?.activeSlot ?? 'primary';
  return beforeSlot === afterSlot &&
    (beforeSlot === 'primary' || before?.transactionId === after?.transactionId);
}

export async function readActiveVaultIdentitySnapshot(): Promise<ActiveVaultIdentitySnapshot> {
  const before = await readVaultActiveSlot();
  if (before?.activeSlot === 'candidate') {
    const resolution = await readActiveVaultV3();
    const after = await readVaultActiveSlot();
    if (
      resolution.slot !== 'candidate' ||
      !pointersMatch(before, after)
    ) {
      throw new Error('Active wallet identity snapshot changed during verification.');
    }
    return { slot: 'candidate', status: 'present', vault: resolution.vault };
  }

  const status = await getVaultStatus();
  const vault = status === 'present' ? await readVaultV3() : null;
  const after = await readVaultActiveSlot();
  if (!pointersMatch(before, after)) {
    throw new Error('Active wallet identity snapshot changed during verification.');
  }
  return { slot: 'primary', status, vault };
}

export async function getActiveVaultStatus(): Promise<VaultStatus> {
  return (await readActiveVaultIdentitySnapshot()).status;
}
