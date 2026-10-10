import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Testnet signed payload lifecycle safety', () => {
  it('has no persistence, network, signer, or broadcast implementation', () => {
    const source = readFileSync(join(process.cwd(), 'src/security/testnet-signed-payload-lifecycle.ts'), 'utf8');
    expect(source).not.toMatch(/(?:secure-store|async-storage|private.?key|mnemonic|signTransaction|sendTransaction|writeContract|createWalletClient|\bfetch\(|\bhttp\()/i);
  });
});
