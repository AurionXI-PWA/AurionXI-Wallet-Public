import { describe, expect, it } from 'vitest';

import { evaluateMainnetReadiness } from './mainnet-readiness-policy';

describe('Mainnet readiness policy', () => {
  it.each(['read', 'sign', 'broadcast'] as const)(
    'allows public read only and keeps state-changing Mainnet capabilities disabled',
    (capability) => {
      expect(evaluateMainnetReadiness(capability)).toEqual(
        capability === 'read' ? { allowed: true } : { allowed: false, reason: 'not-released' },
      );
    },
  );
});
