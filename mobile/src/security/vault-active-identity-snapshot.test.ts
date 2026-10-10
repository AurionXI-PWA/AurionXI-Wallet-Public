import { beforeEach, describe, expect, it, vi } from 'vitest';

import { readActiveVaultIdentitySnapshot } from './vault-active-identity-snapshot';
import type { VaultV3Envelope } from './vault-envelope-v3';

const { getVaultStatus, readActiveVaultV3, readVaultActiveSlot, readVaultV3 } = vi.hoisted(() => ({
  getVaultStatus: vi.fn(),
  readActiveVaultV3: vi.fn(),
  readVaultActiveSlot: vi.fn(),
  readVaultV3: vi.fn(),
}));

vi.mock('./vault-active-resolver', () => ({ readActiveVaultV3 }));
vi.mock('./vault-active-slot-store', () => ({ readVaultActiveSlot }));
vi.mock('./vault-store', () => ({ getVaultStatus, readVaultV3 }));

const vault = {
  createdAt: '2026-08-09T00:00:00.000Z',
  publicAddress: '0x0000000000000000000000000000000000000001',
} as unknown as VaultV3Envelope;
const candidatePointer = {
  activeSlot: 'candidate',
  format: 'aurionxi-vault-active-slot-v1',
  transactionId: '0123456789abcdef0123456789abcdef',
} as const;

describe('active vault identity snapshot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    readVaultActiveSlot.mockResolvedValue(null);
    getVaultStatus.mockResolvedValue('present');
    readVaultV3.mockResolvedValue(vault);
    readActiveVaultV3.mockResolvedValue({ slot: 'candidate', vault });
  });

  it('binds identity checks to a stable primary vault snapshot', async () => {
    await expect(readActiveVaultIdentitySnapshot()).resolves.toEqual({
      slot: 'primary',
      status: 'present',
      vault,
    });
    expect(readActiveVaultV3).not.toHaveBeenCalled();
  });

  it('preserves corrupt-primary identity recovery semantics without reading a vault', async () => {
    getVaultStatus.mockResolvedValue('corrupt');
    await expect(readActiveVaultIdentitySnapshot()).resolves.toEqual({
      slot: 'primary',
      status: 'corrupt',
      vault: null,
    });
    expect(readVaultV3).not.toHaveBeenCalled();
  });

  it('binds identity checks to the transaction-verified active candidate', async () => {
    readVaultActiveSlot.mockResolvedValue(candidatePointer);
    await expect(readActiveVaultIdentitySnapshot()).resolves.toEqual({
      slot: 'candidate',
      status: 'present',
      vault,
    });
    expect(getVaultStatus).not.toHaveBeenCalled();
    expect(readVaultV3).not.toHaveBeenCalled();
  });

  it('fails closed if the active pointer changes during primary inspection', async () => {
    readVaultActiveSlot
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(candidatePointer);
    await expect(readActiveVaultIdentitySnapshot()).rejects.toThrow(
      'snapshot changed during verification',
    );
  });

  it('fails closed if the candidate transaction changes during inspection', async () => {
    readVaultActiveSlot
      .mockResolvedValueOnce(candidatePointer)
      .mockResolvedValueOnce({ ...candidatePointer, transactionId: 'abcdef0123456789abcdef0123456789' });
    await expect(readActiveVaultIdentitySnapshot()).rejects.toThrow(
      'snapshot changed during verification',
    );
  });
});
