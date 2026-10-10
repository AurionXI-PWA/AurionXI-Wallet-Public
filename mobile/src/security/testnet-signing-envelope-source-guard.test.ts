import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Testnet signing envelope safety', () => {
  it('only binds existing data and contains no credential, sign, network, storage, or broadcast code', () => {
    const source = readFileSync(join(process.cwd(), 'src/security/testnet-signing-envelope.ts'), 'utf8');
    expect(source).not.toMatch(/(?:private.?key|mnemonic|signTransaction|sendTransaction|writeContract|createWalletClient|secure-store|async-storage|\bfetch\(|\bhttp\()/i);
  });
});
