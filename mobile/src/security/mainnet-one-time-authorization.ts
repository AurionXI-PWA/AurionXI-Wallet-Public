import type { Address } from 'viem';

/**
 * Opaque, one-use confirmation handle for a future native signing coordinator.
 * It intentionally contains no review details that a caller could alter.
 */
const mainnetAuthorizationBrand: unique symbol = Symbol('mainnetAuthorization');
export type MainnetOneTimeAuthorization = Readonly<{ id: string; [mainnetAuthorizationBrand]: true }>;

type AuthorizationRecord = Readonly<{
  senderAddress: Address;
  reviewFingerprint: string;
  authorizationEpoch: number;
  method: 'pin' | 'biometric';
  expiresAt: number;
  consumed: boolean;
}>;

export type MainnetAuthorizationRegistry = Readonly<{
  issue: (input: Omit<AuthorizationRecord, 'consumed'> & { now: number; id: string }) => MainnetOneTimeAuthorization;
  consume: (input: { authorization: MainnetOneTimeAuthorization; senderAddress: Address; reviewFingerprint: string; authorizationEpoch: number; now: number }) => { method: 'pin' | 'biometric' };
  invalidateAll: () => void;
}>;

/**
 * This in-memory reference implementation is deliberately not wired into the
 * preview. A production release must host the equivalent registry in the
 * native signing coordinator, invalidating it on lock/background/wallet change.
 */
export function createMainnetAuthorizationRegistry(): MainnetAuthorizationRegistry {
  const records = new Map<string, AuthorizationRecord>();
  return Object.freeze({
    issue: ({ now, id, ...record }) => {
      if (!id || record.expiresAt <= now) throw new Error('Invalid Mainnet authorization.');
      records.set(id, Object.freeze({ ...record, consumed: false }));
      return Object.freeze({ id, [mainnetAuthorizationBrand]: true as const }) as MainnetOneTimeAuthorization;
    },
    consume: ({ authorization, senderAddress, reviewFingerprint, authorizationEpoch, now }) => {
      const record = records.get(authorization.id);
      if (!record || record.consumed || now >= record.expiresAt
        || record.senderAddress.toLowerCase() !== senderAddress.toLowerCase()
        || record.reviewFingerprint !== reviewFingerprint
        || record.authorizationEpoch !== authorizationEpoch) {
        throw new Error('Mainnet authorization is invalid, expired, or already consumed.');
      }
      records.set(authorization.id, Object.freeze({ ...record, consumed: true }));
      return { method: record.method };
    },
    invalidateAll: () => records.clear(),
  });
}
