import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Testnet send controller safety', () => {
  it('contains no credential, storage, signing, RPC request, or broadcast implementation', () => {
    const source = readFileSync(join(process.cwd(), 'src/security/testnet-send-controller.ts'), 'utf8');
    expect(source).not.toMatch(/(?:secure-store|async-storage|private.?key|createWalletClient|signTransaction|sendTransaction|writeContract|\bfetch\(|\bhttp\()/i);
  });
});
