import { validatePin } from './pin-policy';
import type { VaultV3Envelope, VaultV3Metadata } from './vault-envelope-v3';

export type VaultV3Dependencies = {
  decryptPayload: (
    ciphertext: string,
    vaultKeyHex: string,
    metadata: VaultV3Metadata,
  ) => Promise<Uint8Array>;
  derivePinWrappingKey: (pin: string, saltHex: string) => Promise<string>;
  encryptPayload: (
    payload: Uint8Array,
    vaultKeyHex: string,
    metadata: VaultV3Metadata,
  ) => Promise<string>;
  generateSaltHex: () => Promise<string>;
  generateVaultKeyHex: () => Promise<string>;
  unwrapVaultKey: (
    wrappedVaultKey: string,
    wrappingKeyHex: string,
    metadata: VaultV3Metadata,
  ) => Promise<string>;
  wrapVaultKey: (
    vaultKeyHex: string,
    wrappingKeyHex: string,
    metadata: VaultV3Metadata,
  ) => Promise<string>;
};

export type CreateVaultV3Input = VaultV3Metadata & {
  payload: Uint8Array;
  pin: string;
  pinConfirmation: string;
};

export class VaultV3WorkflowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VaultV3WorkflowError';
  }
}

function validateMetadata(metadata: VaultV3Metadata): void {
  if (!/^0x[a-fA-F0-9]{40}$/.test(metadata.publicAddress)) {
    throw new VaultV3WorkflowError('The public wallet address is invalid.');
  }
  if (Number.isNaN(Date.parse(metadata.createdAt))) {
    throw new VaultV3WorkflowError('The vault creation time is invalid.');
  }
}

export async function createVaultV3WithDependencies(
  input: CreateVaultV3Input,
  dependencies: VaultV3Dependencies,
): Promise<VaultV3Envelope> {
  const pinValidation = validatePin(input.pin, input.pinConfirmation);
  if (!pinValidation.ok) throw new VaultV3WorkflowError(pinValidation.message);
  if (input.payload.length === 0) throw new VaultV3WorkflowError('The vault payload is empty.');

  const metadata = { createdAt: input.createdAt, publicAddress: input.publicAddress };
  validateMetadata(metadata);

  const [saltHex, vaultKeyHex] = await Promise.all([
    dependencies.generateSaltHex(),
    dependencies.generateVaultKeyHex(),
  ]);
  const wrappingKeyHex = await dependencies.derivePinWrappingKey(input.pin, saltHex);
  const [payloadCiphertext, wrappedVaultKey] = await Promise.all([
    dependencies.encryptPayload(input.payload, vaultKeyHex, metadata),
    dependencies.wrapVaultKey(vaultKeyHex, wrappingKeyHex, metadata),
  ]);

  return {
    ...metadata,
    format: 'aurionxi-vault-v3',
    payloadCiphertext,
    pin: { algorithm: 'argon2id', saltHex, wrappedVaultKey },
  };
}

export async function unlockVaultV3WithPin(
  envelope: VaultV3Envelope,
  pin: string,
  dependencies: VaultV3Dependencies,
): Promise<Uint8Array> {
  const pinValidation = validatePin(pin);
  if (!pinValidation.ok) throw new VaultV3WorkflowError(pinValidation.message);
  const metadata = { createdAt: envelope.createdAt, publicAddress: envelope.publicAddress };
  validateMetadata(metadata);

  const wrappingKeyHex = await dependencies.derivePinWrappingKey(pin, envelope.pin.saltHex);
  const vaultKeyHex = await dependencies.unwrapVaultKey(
    envelope.pin.wrappedVaultKey,
    wrappingKeyHex,
    metadata,
  );
  return dependencies.decryptPayload(envelope.payloadCiphertext, vaultKeyHex, metadata);
}
