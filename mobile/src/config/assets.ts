import { ARXI_TOKEN } from './network';

export type PublicAsset = {
  id: 'native-bnb' | 'arxi' | 'usdt';
  kind: 'native' | 'bep20';
  name: string;
  symbol: string;
  decimals: number;
  accent: string;
  address?: `0x${string}`;
};

/**
 * Explicit BSC Testnet allowlist for the public portfolio.
 * Never populate this registry from an RPC response or user input.
 */
export const PUBLIC_ASSETS = [
  {
    id: 'native-bnb',
    kind: 'native',
    name: 'BNB Smart Chain',
    symbol: 'tBNB',
    decimals: 18,
    accent: '#f3ba2f',
  },
  {
    id: 'arxi',
    kind: 'bep20',
    name: ARXI_TOKEN.name,
    symbol: ARXI_TOKEN.symbol,
    decimals: ARXI_TOKEN.decimals,
    accent: '#7cf6bd',
    address: ARXI_TOKEN.address,
  },
  {
    // BNB Chain's reviewed BSC Testnet faucet USDT contract.
    id: 'usdt',
    kind: 'bep20',
    name: 'Tether USD',
    symbol: 'USDT',
    decimals: 18,
    accent: '#26a17b',
    address: '0x337610d27c682E347C9cD60BD4b3b107C9d34dDd',
  },
] as const satisfies readonly PublicAsset[];

export function getPublicAsset(id: PublicAsset['id']) {
  return PUBLIC_ASSETS.find((asset) => asset.id === id);
}
