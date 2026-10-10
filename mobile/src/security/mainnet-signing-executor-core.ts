import type { Address, Hex } from 'viem';

import { getMainnetTransactionFingerprint, prepareUnsignedMainnetTransaction, type MainnetUnsignedTransaction } from './mainnet-local-signing-adapter';
import { evaluateMainnetReadiness } from './mainnet-readiness-policy';
import { getMainnetBoundReviewFingerprint, type MainnetReviewEnvelope } from './mainnet-review-envelope';
import { hasValidMainnetSenderBinding } from './mainnet-sender-binding';

export type MainnetSigningEnvelope = MainnetUnsignedTransaction;

export type MainnetConfirmedSigningSession = Readonly<{
  chainId: 56;
  reviewFingerprint: string;
  expiresAt: number;
}>;

export type ScopedMainnetSigner = {
  address: Address;
  signTransaction: (transaction: MainnetSigningEnvelope) => Promise<Hex>;
};

export class MainnetSigningExecutorError extends Error {
  constructor(message: 'Mainnet signing is not released.' | 'Mainnet confirmation is expired.' | 'The confirmed review does not match this transaction.' | 'The sender does not match the active Mainnet wallet.' | 'The scoped signer does not match this wallet.' | 'Invalid Mainnet signing envelope.' | 'Mainnet signing did not complete.') {
    super(message);
    this.name = 'MainnetSigningExecutorError';
  }
}

/**
 * Cryptographic signing core for a future audited production release. It has
 * no release flag, PIN UI, vault storage, network client, or broadcaster.
 * A caller must supply an already-authorized, callback-scoped signer.
 */
export async function signConfirmedMainnetEnvelope(input: {
  session: MainnetConfirmedSigningSession;
  now: number;
  activeWalletAddress: Address;
  review: MainnetReviewEnvelope;
  envelope: MainnetSigningEnvelope;
  withScopedSigner: <T>(consumer: (signer: ScopedMainnetSigner) => Promise<T>) => Promise<T>;
}): Promise<Hex> {
  // This check is deliberately inside the operational primitive, not only in
  // UI or a caller-controlled coordinator. Preview builds cannot obtain a
  // Mainnet signature even through a direct import.
  if (!evaluateMainnetReadiness('sign').allowed) {
    throw new MainnetSigningExecutorError('Mainnet signing is not released.');
  }
  if (input.session.chainId !== 56 || input.now >= input.session.expiresAt) throw new MainnetSigningExecutorError('Mainnet confirmation is expired.');
  if (input.envelope.chainId !== 56 || input.envelope.gas <= 0n || input.envelope.gasPrice <= 0n || !Number.isSafeInteger(input.envelope.nonce) || input.envelope.nonce < 0) {
    throw new MainnetSigningExecutorError('Invalid Mainnet signing envelope.');
  }
  const prepared = prepareUnsignedMainnetTransaction(input.review);
  if (!prepared.ok || input.session.reviewFingerprint !== getMainnetBoundReviewFingerprint(input.review) || getMainnetTransactionFingerprint(prepared.transaction) !== getMainnetTransactionFingerprint(input.envelope)) {
    throw new MainnetSigningExecutorError('The confirmed review does not match this transaction.');
  }
  try {
    return await input.withScopedSigner(async (signer) => {
      if (!hasValidMainnetSenderBinding({ review: input.review, activeWalletAddress: input.activeWalletAddress, signerAddress: signer.address })) {
        throw new MainnetSigningExecutorError('The sender does not match the active Mainnet wallet.');
      }
      return signer.signTransaction(input.envelope);
    });
  } catch (error) {
    if (error instanceof MainnetSigningExecutorError) throw error;
    throw new MainnetSigningExecutorError('Mainnet signing did not complete.');
  }
}
