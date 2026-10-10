import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(join(process.cwd(), 'src/security/synthetic-testnet-signature-foundation.ts'), 'utf8');

describe('synthetic Testnet signature foundation source guard', () => {
  it('has no persistent storage, RPC, or transaction-broadcast implementation', () => {
    expect(source).not.toMatch(/(?:secure-store|async-storage|createWalletClient|sendTransaction|writeContract|\bfetch\()/i);
  });
});
