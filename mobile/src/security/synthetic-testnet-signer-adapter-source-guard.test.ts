import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(join(process.cwd(), 'src/security/synthetic-testnet-signer-adapter.ts'), 'utf8');

describe('synthetic Testnet signer adapter source guard', () => {
  it('contains no account, storage, network client, signing, or broadcast implementation', () => {
    expect(source).not.toMatch(/(?:viem\/accounts|secure-store|async-storage|createWalletClient|signTransaction|sendTransaction|writeContract|\bfetch\()/i);
  });
});
