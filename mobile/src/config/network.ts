import { bscTestnet } from 'viem/chains';

import { evaluateSigningFeatureGate } from '@/security/signing-feature-gate';
import { evaluateWalletSecretFeatureGate } from '@/security/wallet-secret-feature-gate';

export const NETWORK = {
  chain: bscTestnet,
  chainId: bscTestnet.id,
  name: 'BSC Testnet',
  explorerUrl: 'https://testnet.bscscan.com',
  contracts: {
    // Fresh deployment recorded on 2026-07-22 in the read-only Core reference.
    arxi: '0x3A3f02F22a6Cf16122A7C752B73E65E05Df466fA',
  },
} as const;

/**
 * Read-only metadata verified from the supplied BSC Testnet TokenDiamond source.
 * Keep this separate from live RPC reads: no RPC response can silently relabel an asset.
 */
export const ARXI_TOKEN = {
  address: NETWORK.contracts.arxi,
  name: 'AurionXI',
  symbol: 'ARXI',
  decimals: 18,
} as const;

export const WALLET_SECRET_FEATURE = evaluateWalletSecretFeatureGate({
  chainId: NETWORK.chainId,
  chainIsTestnet: NETWORK.chain.testnet === true,
  requested: process.env.EXPO_PUBLIC_ENABLE_TESTNET_WALLET_SECRETS === 'true',
});

export const ISOLATED_TESTNET_BUILD = WALLET_SECRET_FEATURE.enabled;

/**
 * Private Preview is a distribution label only. It remains bound to the same
 * BSC Testnet-only security gate and must never imply Mainnet availability.
 */
export const PRIVATE_PREVIEW_BUILD =
  ISOLATED_TESTNET_BUILD && process.env.EXPO_PUBLIC_PRIVATE_PREVIEW === 'true';

export const SIGNING_FEATURE = evaluateSigningFeatureGate({
  chainId: NETWORK.chainId,
  chainIsTestnet: NETWORK.chain.testnet === true,
  requested: process.env.EXPO_PUBLIC_ENABLE_TESTNET_SIGNING === 'true',
  walletSecretsEnabled: WALLET_SECRET_FEATURE.enabled,
});

export function getAddressExplorerUrl(address: string) {
  return `${NETWORK.explorerUrl}/address/${address}`;
}

export function getTransactionExplorerUrl(hash: string) {
  return `${NETWORK.explorerUrl}/tx/${hash}`;
}
