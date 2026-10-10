import { WALLET_KEY_POLICY } from './wallet-key-policy';

export type WalletIdentityRecord = {
  derivationPath: typeof WALLET_KEY_POLICY.derivationPath;
  format: 'aurionxi-wallet-identity-v1';
  publicAddress: `0x${string}`;
  vaultCreatedAt: string;
};

export function isWalletIdentityRecord(value: unknown): value is WalletIdentityRecord {
  if (!value || typeof value !== 'object') return false;
  const record = value as Partial<WalletIdentityRecord>;
  const keys = Object.keys(record).sort();
  const expectedKeys = ['derivationPath', 'format', 'publicAddress', 'vaultCreatedAt'];
  return keys.length === expectedKeys.length &&
    keys.every((key, index) => key === expectedKeys[index]) &&
    record.format === 'aurionxi-wallet-identity-v1' &&
    record.derivationPath === WALLET_KEY_POLICY.derivationPath &&
    typeof record.publicAddress === 'string' &&
    /^0x[a-fA-F0-9]{40}$/.test(record.publicAddress) &&
    typeof record.vaultCreatedAt === 'string' &&
    !Number.isNaN(Date.parse(record.vaultCreatedAt));
}

export function createWalletIdentityRecord(
  publicAddress: `0x${string}`,
  vaultCreatedAt: string,
): WalletIdentityRecord {
  const record: WalletIdentityRecord = {
    derivationPath: WALLET_KEY_POLICY.derivationPath,
    format: 'aurionxi-wallet-identity-v1',
    publicAddress,
    vaultCreatedAt,
  };
  if (!isWalletIdentityRecord(record)) throw new Error('Wallet identity record is invalid.');
  return record;
}
