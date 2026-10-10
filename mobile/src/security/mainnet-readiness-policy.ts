/**
 * Mainnet has a separate local vault and public read/review surfaces in the
 * Private Preview. Real-fund sign and broadcast capability is not released.
 *
 * This policy is the single future activation boundary: a later reviewed
 * release must explicitly approve each capability. An environment flag,
 * a UI selection, or a supplied chain id can never enable Mainnet here.
 */
export type MainnetCapability = 'read' | 'sign' | 'broadcast';

export type MainnetReadinessDecision =
  | { allowed: true }
  | { allowed: false; reason: 'not-released' };

export function evaluateMainnetReadiness(
  capability: MainnetCapability,
): MainnetReadinessDecision {
  // This release authorizes a public, server-mediated portfolio view only.
  // Local key access and every state-changing capability remain blocked.
  if (capability === 'read') return { allowed: true };
  return { allowed: false, reason: 'not-released' };
}
