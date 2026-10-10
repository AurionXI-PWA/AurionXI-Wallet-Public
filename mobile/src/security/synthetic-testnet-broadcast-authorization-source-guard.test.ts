import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(join(process.cwd(), 'src/security/synthetic-testnet-broadcast-authorization.ts'), 'utf8');

describe('synthetic Testnet authorization source guard', () => {
  it('has no account, storage, RPC, or broadcast implementation', () => {
    expect(source).not.toMatch(/(?:viem\/accounts|secure-store|async-storage|createWalletClient|sendTransaction|writeContract|\bfetch\()/i);
  });
});
