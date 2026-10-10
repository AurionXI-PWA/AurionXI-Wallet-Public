import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(join(process.cwd(), 'src/app/wallet/index.tsx'), 'utf8');

describe('Testnet send entry visibility', () => {
  it('keeps the secure send entry visible for a device-local wallet without depending on a distribution label', () => {
    expect(source).toContain("vaultStatus === 'present' && WALLET_SECRET_FEATURE.enabled");
    expect(source).toContain('Unlock to send assets');
    expect(source).toContain('Send assets');
    expect(source).not.toContain("vaultStatus === 'present' && !isLocked && PRIVATE_PREVIEW_BUILD");
  });
});
