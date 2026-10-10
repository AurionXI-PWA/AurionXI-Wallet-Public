import type { Hash, Hex } from 'viem';

import { getMainnetBoundReviewFingerprint, type MainnetReviewEnvelope } from './mainnet-review-envelope';

export const MAINNET_EXPLICIT_BROADCAST_APPROVAL_TTL_MS = 30_000;

export type MainnetExplicitBroadcastApproval = Readonly<{
  reviewFingerprint: string;
  approvedAt: number;
  expiresAt: number;
}>;

export type MainnetProductionReleaseGate = { ok: false; reason: 'mainnet-production-release-not-approved' };

export function getMainnetReviewFingerprint(review: MainnetReviewEnvelope): string {
  return getMainnetBoundReviewFingerprint(review);
}

/** Creates a one-time approval tied to the exact immutable Mainnet review. */
export function createMainnetExplicitBroadcastApproval(input: {
  review: MainnetReviewEnvelope;
  userConfirmed: boolean;
  now: number;
}): MainnetExplicitBroadcastApproval | undefined {
  if (!input.userConfirmed) return undefined;
  return Object.freeze({ reviewFingerprint: getMainnetReviewFingerprint(input.review), approvedAt: input.now, expiresAt: input.now + MAINNET_EXPLICIT_BROADCAST_APPROVAL_TTL_MS });
}

/**
 * Preview builds are structurally unable to activate Mainnet broadcast.
 * Production approval cannot be supplied at runtime by a caller, route, or
 * environment value. A future separately audited production flavor must add
 * its own coordinator in a reviewed change set.
 */
export function evaluateMainnetProductionReleaseGate(_input: {
  review: MainnetReviewEnvelope;
  approval?: MainnetExplicitBroadcastApproval;
  signedPayload: Hex;
  expectedHash: Hash;
  now: number;
}): MainnetProductionReleaseGate {
  return { ok: false, reason: 'mainnet-production-release-not-approved' };
}
