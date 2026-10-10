import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Mainnet preview authorization lifecycle', () => {
  it('invalidates authorization and in-memory reviews when the app backgrounds', () => {
    const session = readFileSync(join(process.cwd(), 'src/security/mainnet-session-lock-provider.tsx'), 'utf8');
    const flow = readFileSync(join(process.cwd(), 'src/security/mainnet-send-flow-provider.tsx'), 'utf8');
    const confirm = readFileSync(join(process.cwd(), 'src/app/wallet/mainnet-secure-confirm.tsx'), 'utf8');
    expect(session).toContain('invalidateAuthorization()');
    expect(session).toContain('isAuthorizationActive');
    expect(flow).toContain("if (next === 'background') clear()");
    expect(flow).toContain('productionCoordinator.invalidate()');
    expect(flow).toContain('[authorizationEpoch, isLocked, productionCoordinator]');
    expect(confirm).toContain('if (!isAuthorizationActive(confirmationEpoch))');
  });
});
