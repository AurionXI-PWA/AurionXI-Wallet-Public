import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(join(process.cwd(), 'src/app/wallet/transaction-review.tsx'), 'utf8');

describe('transaction review screen safety boundary', () => {
  it('keeps the review screen Testnet-preview-only and the sign action unavailable', () => {
    expect(source).toContain('if (!WALLET_SECRET_FEATURE.enabled) return <Redirect href="/" />;');
    expect(source).toContain('disabled');
    expect(source).toContain('Review transfer to continue');
  });

  it('does not access credentials, storage, biometric APIs, or a network client', () => {
    expect(source).not.toMatch(/from ['"].*(?:secure-store|async-storage|local-authentication|vault-|session-lock)/i);
    expect(source).not.toMatch(/(?:\bfetch\(|createWalletClient|signTransaction|sendTransaction)/);
  });
});
