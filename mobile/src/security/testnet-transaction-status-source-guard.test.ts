import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Testnet transaction status safety', () => {
  it('has no storage, RPC, signing, or broadcast implementation', () => {
    const source = readFileSync(join(process.cwd(), 'src/security/testnet-transaction-status.ts'), 'utf8');
    expect(source).not.toMatch(/(?:secure-store|async-storage|createWalletClient|signTransaction|sendTransaction|writeContract|\bfetch\(|\bhttp\()/i);
  });
});
