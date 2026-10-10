import type { EncryptedVaultEnvelope } from './vault-store';
import type { VaultV3Envelope } from './vault-envelope-v3';

export type VaultV3MigrationDependencies = {
  buildV3: (legacy: EncryptedVaultEnvelope, plaintext: Uint8Array, pin: string) => Promise<VaultV3Envelope>;
  deleteLegacy: () => Promise<void>;
  deleteV3: () => Promise<void>;
  decryptLegacy: (legacy: EncryptedVaultEnvelope, pin: string) => Promise<Uint8Array>;
  readLegacy: () => Promise<EncryptedVaultEnvelope | null>;
  readV3: () => Promise<VaultV3Envelope | null>;
  unlockV3: (envelope: VaultV3Envelope, pin: string) => Promise<Uint8Array>;
  writeV3: (envelope: VaultV3Envelope) => Promise<void>;
};

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

export async function migrateV2ToV3Atomically(
  pin: string,
  dependencies: VaultV3MigrationDependencies,
): Promise<VaultV3Envelope> {
  const legacy = await dependencies.readLegacy();
  if (!legacy) throw new Error('No legacy v2 vault exists.');
  const plaintext = await dependencies.decryptLegacy(legacy, pin);
  const envelope = await dependencies.buildV3(legacy, plaintext, pin);

  let wroteV3 = false;
  try {
    await dependencies.writeV3(envelope);
    wroteV3 = true;
    const stored = await dependencies.readV3();
    if (!stored) throw new Error('The migrated v3 vault could not be read back.');
    const verified = await dependencies.unlockV3(stored, pin);
    if (!equalBytes(plaintext, verified)) throw new Error('The migrated v3 vault failed verification.');
    await dependencies.deleteLegacy();
    return stored;
  } catch (error) {
    if (wroteV3) {
      try {
        await dependencies.deleteV3();
      } catch {
        // The verified legacy copy is intentionally retained as authoritative.
      }
    }
    throw error;
  }
}
