import type { Address } from 'viem';

import { NETWORK_TARGETS } from '@/config/network-targets';

/**
 * Public Mainnet activity is explorer-linked until a separately reviewed
 * server-side history endpoint is released. This creates no RPC client and
 * never uses wallet secrets.
 */
export function getMainnetPublicActivityExplorerUrl(address: Address): string {
  return `${NETWORK_TARGETS.mainnet.explorerUrl}/address/${address}#tokentxns`;
}
