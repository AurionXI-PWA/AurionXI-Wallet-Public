import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Testnet broadcast gate safety', () => {
  it('uses a scoped callback and contains no network client, broadcast, signer, credential, or storage implementation', () => {
    const source = readFileSync(join(process.cwd(), 'src/security/testnet-broadcast-gate.ts'), 'utf8');
    expect(source).toContain('consume: (serializedTransaction: Hex)');
    expect(source).not.toMatch(/(?:createWalletClient|sendTransaction|writeContract|signTransaction|private.?key|mnemonic|secure-store|async-storage|\bfetch\(|\bhttp\()/i);
  });
});
