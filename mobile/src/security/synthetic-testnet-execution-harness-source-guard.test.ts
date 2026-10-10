import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(join(process.cwd(), 'src/security/synthetic-testnet-execution-harness.ts'), 'utf8');

describe('synthetic Testnet execution harness source guard', () => {
  it('has no transport, account, storage, signing, or RPC implementation', () => {
    expect(source).not.toMatch(/(?:viem\/accounts|secure-store|async-storage|createWalletClient|sendTransaction|writeContract|\bfetch\(|\bhttp\()/i);
  });
});
