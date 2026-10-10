import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(join(process.cwd(), 'src/security/synthetic-testnet-transfer-builder.ts'), 'utf8');

describe('synthetic Testnet transfer builder source guard', () => {
  it('has no account, storage, signing, RPC, or broadcast implementation', () => {
    expect(source).not.toMatch(/(?:viem\/accounts|secure-store|async-storage|createWalletClient|signTransaction|sendTransaction|writeContract|\bfetch\()/i);
  });
});
