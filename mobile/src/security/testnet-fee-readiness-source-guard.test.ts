import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Testnet fee readiness safety', () => {
  it('does not fetch, sign, broadcast, access secrets, or persist fee state', () => {
    const source = readFileSync(join(process.cwd(), 'src/security/testnet-fee-readiness.ts'), 'utf8');
    expect(source).not.toMatch(/(?:secure-store|async-storage|private.?key|createWalletClient|signTransaction|sendTransaction|writeContract|\bfetch\(|\bhttp\()/i);
  });
});
