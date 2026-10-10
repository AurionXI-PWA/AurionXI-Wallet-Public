import { describe, expect, it, vi } from 'vitest';
import type { Address } from 'viem';

import { getPublicAsset } from '@/config/assets';
import { fetchTestnetTransactionSnapshotWithClient, type TestnetTransactionSnapshotClient } from './testnet-transaction-snapshot';

const address = '0x1111111111111111111111111111111111111111' as Address;
const nativeAsset = getPublicAsset('native-bnb')!;
const arxiAsset = getPublicAsset('arxi');
if (!arxiAsset || arxiAsset.kind !== 'bep20' || !arxiAsset.address) throw new Error('ARXI must remain a reviewed BEP-20 asset.');

describe('Testnet transaction snapshot', () => {
  it('reads only public tBNB balance, pending nonce, and gas price', async () => {
    const client = {
      getBalance: vi.fn().mockResolvedValue(2_000_000_000_000_000n),
      getTransactionCount: vi.fn().mockResolvedValue(7),
      getGasPrice: vi.fn().mockResolvedValue(1_000_000_000n),
      readContract: vi.fn(),
    } as unknown as TestnetTransactionSnapshotClient;
    await expect(fetchTestnetTransactionSnapshotWithClient(client, address, nativeAsset)).resolves.toEqual({ chainId: 97, nativeBalanceWei: 2_000_000_000_000_000n, assetBalanceWei: 2_000_000_000_000_000n, nonce: 7n, gasPriceWei: 1_000_000_000n });
    expect(client.getBalance).toHaveBeenCalledWith({ address });
    expect(client.getTransactionCount).toHaveBeenCalledWith({ address, blockTag: 'pending' });
  });

  it('fails closed for invalid public metadata', async () => {
    const client = {
      getBalance: vi.fn().mockResolvedValue(1n),
      getTransactionCount: vi.fn().mockResolvedValue(0),
      getGasPrice: vi.fn().mockResolvedValue(0n),
      readContract: vi.fn(),
    } as unknown as TestnetTransactionSnapshotClient;
    await expect(fetchTestnetTransactionSnapshotWithClient(client, address, nativeAsset)).rejects.toThrow('metadata is invalid');
  });

  it('reads only the reviewed token contract balance for a token transfer', async () => {
    const client = {
      getBalance: vi.fn().mockResolvedValue(2_000_000_000_000_000n),
      getTransactionCount: vi.fn().mockResolvedValue(7),
      getGasPrice: vi.fn().mockResolvedValue(1_000_000_000n),
      readContract: vi.fn().mockResolvedValue(12_000_000_000_000_000_000n),
    } as unknown as TestnetTransactionSnapshotClient;
    await expect(fetchTestnetTransactionSnapshotWithClient(client, address, arxiAsset)).resolves.toMatchObject({ assetBalanceWei: 12_000_000_000_000_000_000n });
    expect(client.readContract).toHaveBeenCalledWith(expect.objectContaining({ address: arxiAsset.address, functionName: 'balanceOf', args: [address] }));
  });
});
