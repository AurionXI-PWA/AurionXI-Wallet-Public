/**
 * Shared network catalogue for the same AurionXI Wallet core.
 *
 * The Private Preview selects BSC Testnet. BSC Mainnet is intentionally
 * present only as locked metadata until its separate release checklist,
 * verified ARXI contract configuration, and security approval are complete.
 */
export type WalletNetworkTarget = {
  id: 'bsc-testnet' | 'bsc-mainnet';
  chainId: 97 | 56;
  label: string;
  explorerUrl: string;
  availability: 'active' | 'locked';
  nativeAsset: 'tBNB' | 'BNB';
  arxiContract: string | null;
};

export const NETWORK_TARGETS = {
  testnet: {
    id: 'bsc-testnet',
    chainId: 97,
    label: 'BNB Smart Chain Testnet',
    explorerUrl: 'https://testnet.bscscan.com',
    availability: 'active',
    nativeAsset: 'tBNB',
    arxiContract: '0x3A3f02F22a6Cf16122A7C752B73E65E05Df466fA',
  },
  mainnet: {
    id: 'bsc-mainnet',
    chainId: 56,
    label: 'BNB Smart Chain Mainnet',
    explorerUrl: 'https://bscscan.com',
    availability: 'locked',
    nativeAsset: 'BNB',
    // Public production TokenDiamond address. Runtime use remains locked until
    // the separate Mainnet read-only release checklist is complete.
    arxiContract: '0x6fFEC4860325f8bfB3F000354708A7d0caE4b250',
  },
} as const satisfies Record<string, WalletNetworkTarget>;

export const PRIVATE_PREVIEW_NETWORK_TARGET = NETWORK_TARGETS.testnet;

export function canUseNetworkTarget(target: WalletNetworkTarget): boolean {
  return target.availability === 'active';
}
