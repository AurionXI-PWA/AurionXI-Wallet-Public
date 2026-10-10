import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Testnet signing identity boundary safety', () => {
  it('does not derive sensitive credentials, sign, broadcast, or make a network request', () => {
    const source = readFileSync(join(process.cwd(), 'src/security/testnet-signing-identity-boundary.ts'), 'utf8');
    expect(source).not.toMatch(/(?:mnemonic|privateKey|private key|signTransaction|sendTransaction|writeContract|createWalletClient|\bfetch\(|\bhttp\()/i);
  });
});
