import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Testnet send PIN confirmation core safety', () => {
  it('does not contain storage, network, signing, or broadcast implementation', () => {
    const source = readFileSync(join(process.cwd(), 'src/security/testnet-send-pin-confirmation-core.ts'), 'utf8');
    expect(source).not.toMatch(/(?:secure-store|async-storage|private.?key|createWalletClient|signTransaction|sendTransaction|writeContract|\bfetch\(|\bhttp\()/i);
  });
});
