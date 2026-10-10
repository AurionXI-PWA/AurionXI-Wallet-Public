import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Testnet transaction snapshot safety', () => {
  it('uses a public read client and contains no credential, signer, or broadcaster', () => {
    const source = readFileSync(join(process.cwd(), 'src/services/testnet-transaction-snapshot.ts'), 'utf8');
    expect(source).toContain('createPublicClient');
    expect(source).not.toMatch(/(?:private.?key|mnemonic|createWalletClient|signTransaction|sendTransaction|writeContract|secure-store|async-storage)/i);
  });
});
