import { zeroizeBytes } from './secret-memory';
import type { CreateVaultV3Input } from './vault-envelope-v3-core';
import type { VaultV3Envelope } from './vault-envelope-v3';
import type { VaultStatus } from './vault-store';

export type AtomicVaultCreateDependencies = {
  build: (input: CreateVaultV3Input) => Promise<VaultV3Envelope>;
  deleteStored: () => Promise<void>;
  getStatus: () => Promise<VaultStatus>;
  read: () => Promise<VaultV3Envelope | null>;
  unlock: (envelope: VaultV3Envelope, pin: string) => Promise<Uint8Array>;
  write: (envelope: VaultV3Envelope) => Promise<void>;
};

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return difference === 0;
}

export async function createVaultV3Atomically(
  input: CreateVaultV3Input,
  dependencies: AtomicVaultCreateDependencies,
): Promise<VaultV3Envelope> {
  const status = await dependencies.getStatus();
  if (status !== 'empty') {
    throw new Error('Secure vault storage is not empty and cannot be created.');
  }

  const envelope = await dependencies.build(input);
  let wrote = false;
  let verified: Uint8Array | undefined;
  try {
    await dependencies.write(envelope);
    wrote = true;
    const stored = await dependencies.read();
    if (!stored) throw new Error('The newly written wallet vault could not be read back.');
    verified = await dependencies.unlock(stored, input.pin);
    if (!equalBytes(input.payload, verified)) {
      throw new Error('The newly written wallet vault failed plaintext verification.');
    }
    return stored;
  } catch (error) {
    if (wrote) {
      try {
        await dependencies.deleteStored();
      } catch {
        // Preserve the original verification failure. Startup validation will
        // fail closed if cleanup could not remove the unverified new record.
      }
    }
    throw error;
  } finally {
    zeroizeBytes(verified);
  }
}
