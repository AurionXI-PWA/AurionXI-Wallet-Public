import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Testnet RPC broadcaster adapter safety', () => {
  it('accepts only a supplied raw transaction client and contains no wallet or secret implementation', () => {
    const source = readFileSync(join(process.cwd(), 'src/services/testnet-rpc-broadcaster.ts'), 'utf8');
    expect(source).toContain('sendRawTransaction');
    expect(source).not.toMatch(/(?:createWalletClient|signTransaction|private.?key|mnemonic|secure-store|async-storage|\bfetch\(|\bhttp\()/i);
  });
});
