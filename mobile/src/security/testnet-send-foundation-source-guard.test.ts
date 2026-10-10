import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Testnet send foundation safety boundary', () => {
  it('keeps authorization and payload construction free of credentials, storage, signing, RPC, and broadcast', () => {
    const source = ['testnet-send-authorization.ts', 'testnet-transfer-builder.ts']
      .map((file) => readFileSync(join(process.cwd(), 'src/security', file), 'utf8'))
      .join('\n');
    expect(source).not.toMatch(/(?:privateKey|mnemonic|secure-store|async-storage|local-authentication|createWalletClient|signTransaction|sendTransaction|writeContract|\bfetch\(|\bhttp\()/i);
  });
});
