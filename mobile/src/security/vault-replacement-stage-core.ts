import { zeroizeBytes } from './secret-memory';
import {
  canExecuteVaultReplacement,
  type VaultReplacementState,
} from './vault-replacement-policy';
import type { CreateVaultV3Input } from './vault-envelope-v3-core';
import type { VaultV3Envelope } from './vault-envelope-v3';
import type { VaultStatus } from './vault-store';

export type VaultReplacementStageDependencies = {
  buildCandidate: (input: CreateVaultV3Input) => Promise<VaultV3Envelope>;
  deleteCandidate: () => Promise<void>;
  getCurrentStatus: () => Promise<VaultStatus>;
  readCandidate: () => Promise<VaultV3Envelope | null>;
  unlockCandidate: (envelope: VaultV3Envelope, pin: string) => Promise<Uint8Array>;
  writeVerifiedJournal: (
    envelope: VaultV3Envelope,
    targetStatus: 'present' | 'corrupt',
  ) => Promise<void>;
  writeCandidate: (envelope: VaultV3Envelope) => Promise<void>;
};

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return difference === 0;
}

export async function stageVaultReplacementCandidate(
  input: CreateVaultV3Input,
  authorization: VaultReplacementState,
  now: number,
  dependencies: VaultReplacementStageDependencies,
): Promise<VaultV3Envelope> {
  if (!canExecuteVaultReplacement(authorization, now) || !authorization.targetStatus) {
    throw new Error('Vault replacement authorization is invalid or expired.');
  }
  const currentStatus = await dependencies.getCurrentStatus();
  if (currentStatus !== authorization.targetStatus) {
    throw new Error('Vault storage changed after replacement authorization.');
  }
  if (await dependencies.readCandidate()) {
    throw new Error('A staged replacement candidate already exists.');
  }

  const candidate = await dependencies.buildCandidate(input);
  let wroteCandidate = false;
  let verified: Uint8Array | undefined;
  try {
    await dependencies.writeCandidate(candidate);
    wroteCandidate = true;
    const stored = await dependencies.readCandidate();
    if (!stored) throw new Error('The staged replacement candidate could not be read back.');
    verified = await dependencies.unlockCandidate(stored, input.pin);
    if (!equalBytes(input.payload, verified)) {
      throw new Error('The staged replacement candidate failed plaintext verification.');
    }
    await dependencies.writeVerifiedJournal(stored, authorization.targetStatus);
    return stored;
  } catch (error) {
    if (wroteCandidate) {
      try {
        await dependencies.deleteCandidate();
      } catch {
        // Existing authoritative vault remains untouched. Startup recovery can
        // inspect an unverified candidate that cleanup could not remove.
      }
    }
    throw error;
  } finally {
    zeroizeBytes(verified);
  }
}
