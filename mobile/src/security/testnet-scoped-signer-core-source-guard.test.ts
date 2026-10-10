import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Testnet scoped signer core safety', () => {
  it('uses a callback boundary and contains no network, signing, credential, or storage implementation', () => {
    const source = readFileSync(join(process.cwd(), 'src/security/testnet-scoped-signer-core.ts'), 'utf8');
    expect(source).toContain('zeroizeBytes');
    expect(source).not.toMatch(/(?:mnemonic|private.?key|signTransaction|sendTransaction|writeContract|createWalletClient|secure-store|async-storage|\bfetch\(|\bhttp\()/i);
  });
});
