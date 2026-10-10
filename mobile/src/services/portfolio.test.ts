import { describe, expect, it, vi } from 'vitest';
import type { Address } from 'viem';

import { fetchPortfolioWithClient, type PortfolioReadClient } from './portfolio';

const ADDRESS = '0x1111111111111111111111111111111111111111' as Address;
const BLOCK_NUMBER = 9_876_543n;

function makeClient(overrides: Partial<PortfolioReadClient> = {}) {
  return {
    getBlockNumber: vi.fn().mockResolvedValue(BLOCK_NUMBER),
    getBalance: vi.fn().mockResolvedValue(1_250_000_000_000_000_000n),
    getGasPrice: vi.fn().mockResolvedValue(1_000_000_000n),
    readContract: vi
      .fn()
      .mockResolvedValueOnce(42_500_000_000_000_000_000n)
      .mockResolvedValueOnce(2_000_000_000_000_000_000n)
      .mockResolvedValueOnce(false),
    getBlock: vi.fn().mockResolvedValue({ timestamp: 1_784_857_200n }),
    ...overrides,
  } as unknown as PortfolioReadClient;
}

describe('fetchPortfolioWithClient', () => {
  it('reads a consistent BNB, ARXI, and stale-status snapshot at one mocked block', async () => {
    const client = makeClient();
    const result = await fetchPortfolioWithClient(client, ADDRESS);

    expect(result).toMatchObject({
      bnbBalance: '1.25',
      bnbBalanceWei: '1250000000000000000',
      arxiBalance: '42.5',
      usdtBalance: '2',
      gasPriceWei: '1000000000',
      isPaused: false,
      blockNumber: '9876543',
      isBlockStale: true,
    });
    expect(client.getBalance).toHaveBeenCalledWith({ address: ADDRESS, blockNumber: BLOCK_NUMBER });
    expect(client.readContract).toHaveBeenNthCalledWith(1, expect.objectContaining({
      functionName: 'balanceOf', args: [ADDRESS], blockNumber: BLOCK_NUMBER,
    }));
    expect(client.readContract).toHaveBeenNthCalledWith(2, expect.objectContaining({
      functionName: 'balanceOf', args: [ADDRESS], blockNumber: BLOCK_NUMBER,
    }));
    expect(client.readContract).toHaveBeenNthCalledWith(3, expect.objectContaining({
      functionName: 'isPaused', blockNumber: BLOCK_NUMBER,
    }));
  });

  it('propagates a mocked unavailable RPC response without producing a partial portfolio', async () => {
    const client = makeClient({ getBlockNumber: vi.fn().mockRejectedValue(new Error('network timeout')) });
    await expect(fetchPortfolioWithClient(client, ADDRESS)).rejects.toThrow('network timeout');
    expect(client.getBalance).not.toHaveBeenCalled();
    expect(client.readContract).not.toHaveBeenCalled();
  });
});
