import type { WalletNetworkTarget } from './network-targets';

export type NetworkAssetTarget = {
  id: 'native-bnb' | 'arxi' | 'usdt' | 'usdc' | 'eth' | 'btcb';
  kind: 'native' | 'bep20';
  name: string;
  symbol: string;
  decimals: number;
  accent: string;
  address: `0x${string}` | null;
  availability: 'active' | 'locked';
};

const TESTNET_ASSETS = [
  {
    id: 'native-bnb', kind: 'native', name: 'BNB Smart Chain', symbol: 'tBNB', decimals: 18, accent: '#f3ba2f', address: null, availability: 'active',
  },
  {
    id: 'arxi', kind: 'bep20', name: 'AurionXI', symbol: 'ARXI', decimals: 18, accent: '#7cf6bd', address: '0x3A3f02F22a6Cf16122A7C752B73E65E05Df466fA', availability: 'active',
  },
  {
    id: 'usdt', kind: 'bep20', name: 'Tether USD', symbol: 'USDT', decimals: 18, accent: '#26a17b', address: '0x337610d27c682E347C9cD60BD4b3b107C9d34dDd', availability: 'active',
  },
] as const satisfies readonly NetworkAssetTarget[];

/**
 * Curated BSC Mainnet asset policy. Every address is fixed in source and may
 * be queried only through a read-only balanceOf call. This is not token
 * discovery, approval, swap, or transfer support.
 */
const MAINNET_ASSETS = [
  {
    id: 'native-bnb', kind: 'native', name: 'BNB Smart Chain', symbol: 'BNB', decimals: 18, accent: '#f3ba2f', address: null, availability: 'active',
  },
  {
    id: 'arxi', kind: 'bep20', name: 'AurionXI', symbol: 'ARXI', decimals: 18, accent: '#7cf6bd', address: '0x6fFEC4860325f8bfB3F000354708A7d0caE4b250', availability: 'active',
  },
  {
    id: 'usdt', kind: 'bep20', name: 'Tether USD', symbol: 'USDT', decimals: 18, accent: '#26a17b', address: '0x55d398326f99059fF775485246999027B3197955', availability: 'active',
  },
  {
    id: 'usdc', kind: 'bep20', name: 'Binance-Peg USD Coin', symbol: 'USDC', decimals: 18, accent: '#2775ca', address: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', availability: 'active',
  },
  {
    id: 'eth', kind: 'bep20', name: 'Binance-Peg Ethereum', symbol: 'ETH', decimals: 18, accent: '#8a92b2', address: '0x2170Ed0880ac9A755fd29B2688956BD959F933F8', availability: 'active',
  },
  {
    id: 'btcb', kind: 'bep20', name: 'Binance-Peg BTCB', symbol: 'BTCB', decimals: 18, accent: '#f7931a', address: '0x7130d2A12B9BCBfAE4f2634d864A1EE1Ce3Ead9c', availability: 'active',
  },
] as const satisfies readonly NetworkAssetTarget[];

export function getAssetTargetsForNetwork(
  target: WalletNetworkTarget,
): readonly NetworkAssetTarget[] {
  return target.id === 'bsc-testnet' ? TESTNET_ASSETS : MAINNET_ASSETS;
}

export function canReadAssetTarget(asset: NetworkAssetTarget): boolean {
  return asset.availability === 'active';
}
