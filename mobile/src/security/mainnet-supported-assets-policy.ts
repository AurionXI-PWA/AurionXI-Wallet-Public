import { getAssetTargetsForNetwork, type NetworkAssetTarget } from '@/config/asset-targets';
import { NETWORK_TARGETS } from '@/config/network-targets';

export type MainnetAssetSupport = {
  asset: NetworkAssetTarget;
  canRead: boolean;
  canReceive: boolean;
  /** Opens a review only; no signature or broadcast is implied. */
  canPrepareSend: boolean;
  canSend: false;
  canSwap: false;
  futureAction: 'audited-send' | 'reviewed-send';
  reason?: 'reviewed-mainnet-contract-required';
};

/**
 * Central reviewed asset list for the initial Mainnet release. This does not
 * create token discovery, signing, broadcast, or any network capability.
 */
export function getMainnetSupportedAssets(): readonly MainnetAssetSupport[] {
  return getAssetTargetsForNetwork(NETWORK_TARGETS.mainnet).map((asset) => {
    const reviewed = asset.availability === 'active' && (asset.kind === 'native' || Boolean(asset.address));
    const canPrepareSend = asset.id === 'native-bnb' || asset.id === 'arxi' || asset.id === 'usdt';
    return {
      asset,
      canRead: reviewed,
      canReceive: reviewed,
      canPrepareSend,
      canSend: false,
      canSwap: false,
      futureAction: canPrepareSend ? 'audited-send' : 'reviewed-send',
      ...(reviewed ? {} : { reason: 'reviewed-mainnet-contract-required' as const }),
    };
  });
}
