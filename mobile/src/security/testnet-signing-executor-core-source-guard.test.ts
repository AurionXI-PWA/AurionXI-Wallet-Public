import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Testnet signing executor safety', () => {
  it('can sign only through its scoped callback and contains no broadcast, RPC, storage, or credential implementation', () => {
    const source = readFileSync(join(process.cwd(), 'src/security/testnet-signing-executor-core.ts'), 'utf8');
    expect(source).toContain('signer.signTransaction(input.envelope)');
    expect(source).not.toMatch(/(?:secure-store|async-storage|private.?key|mnemonic|createWalletClient|sendTransaction|writeContract|\bfetch\(|\bhttp\()/i);
  });
});
