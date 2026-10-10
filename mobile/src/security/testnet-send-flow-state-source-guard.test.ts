import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Testnet send flow state safety', () => {
  it('contains no PIN, credential, storage, signing, RPC, or broadcast behavior', () => {
    const source = readFileSync(join(process.cwd(), 'src/security/testnet-send-flow-state.ts'), 'utf8');
    expect(source).not.toMatch(/(?:pin|private.?key|mnemonic|secure-store|async-storage|signTransaction|sendTransaction|writeContract|\bfetch\(|\bhttp\()/i);
  });
});
