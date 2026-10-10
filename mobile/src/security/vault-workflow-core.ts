import { validatePin } from './pin-policy';
import type { EncryptedVaultEnvelope } from './vault-store';

export type CreateVaultInput = {
  createdAt: string;
  payload: Uint8Array;
  pin: string;
  pinConfirmation: string;
  publicAddress: `0x${string}`;
};

export type VaultWorkflowDependencies = {
  decrypt: (envelope: EncryptedVaultEnvelope, derivedKeyHex: string) => Promise<Uint8Array>;
  derivePinKey: (pin: string, saltHex: string) => Promise<string>;
  encrypt: (
    payload: Uint8Array,
    derivedKeyHex: string,
    metadata: {
      createdAt: string;
      publicAddress: `0x${string}`;
      saltHex: string;
    }
  ) => Promise<EncryptedVaultEnvelope>;
  generateSaltHex: () => Promise<string>;
  read: () => Promise<EncryptedVaultEnvelope | null>;
  write: (envelope: EncryptedVaultEnvelope) => Promise<void>;
};

export class VaultWorkflowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VaultWorkflowError';
  }
}

export async function createVaultWithDependencies(
  input: CreateVaultInput,
  dependencies: VaultWorkflowDependencies
): Promise<EncryptedVaultEnvelope> {
  const pinValidation = validatePin(input.pin, input.pinConfirmation);
  if (!pinValidation.ok) throw new VaultWorkflowError(pinValidation.message);
  if (input.payload.length === 0) throw new VaultWorkflowError('The vault payload is empty.');

  const saltHex = await dependencies.generateSaltHex();
  const derivedKeyHex = await dependencies.derivePinKey(input.pin, saltHex);
  const envelope = await dependencies.encrypt(input.payload, derivedKeyHex, {
    createdAt: input.createdAt,
    publicAddress: input.publicAddress,
    saltHex,
  });

  // This is the only persistence point. Derivation and encryption must both
  // complete before a complete authenticated envelope can replace storage.
  await dependencies.write(envelope);
  return envelope;
}

export async function unlockVaultWithDependencies(
  pin: string,
  dependencies: VaultWorkflowDependencies
): Promise<Uint8Array> {
  const pinValidation = validatePin(pin);
  if (!pinValidation.ok) throw new VaultWorkflowError(pinValidation.message);

  const envelope = await dependencies.read();
  if (!envelope) throw new VaultWorkflowError('No encrypted wallet vault exists.');
  const derivedKeyHex = await dependencies.derivePinKey(pin, envelope.kdf.saltHex);
  return dependencies.decrypt(envelope, derivedKeyHex);
}
