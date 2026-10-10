import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Testnet broadcast preflight safety', () => {
  it('contains no credential, storage, RPC, signing, or broadcast implementation', () => {
    const source = readFileSync(join(process.cwd(), 'src/security/testnet-broadcast-preflight.ts'), 'utf8');
    expect(source).not.toMatch(/(?:private.?key|secure-store|async-storage|createWalletClient|signTransaction|sendTransaction|writeContract|\bfetch\(|\bhttp\()/i);
  });
});
