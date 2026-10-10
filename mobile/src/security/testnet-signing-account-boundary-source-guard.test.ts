import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Testnet signing account boundary safety', () => {
  it('contains no vault access, account derivation, signing, RPC, or broadcast implementation', () => {
    const source = readFileSync(join(process.cwd(), 'src/security/testnet-signing-account-boundary-core.ts'), 'utf8');
    expect(source).not.toMatch(/(?:secure-store|async-storage|local-authentication|mnemonicToAccount|privateKeyToAccount|signTransaction|sendTransaction|writeContract|\bfetch\(|\bhttp\()/i);
  });
});
