import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Mainnet secure-confirmation safety', () => {
  it('does not inspect credentials, access storage, sign, broadcast, or make network calls', () => {
    const source = readFileSync(join(process.cwd(), 'src/security/mainnet-secure-confirmation.ts'), 'utf8');
    expect(source).not.toMatch(/(?:private.?key|mnemonic|secure-store|async-storage|signTransaction|sendTransaction|writeContract|createWalletClient|\bfetch\(|\bhttp\()/i);
  });
});
