import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('PIN-confirmed signing session safety boundary', () => {
  it('does not accept PIN text or access secrets, storage, account APIs, signing, RPC, or broadcast', () => {
    const source = readFileSync(join(process.cwd(), 'src/security/pin-confirmed-signing-session.ts'), 'utf8');
    expect(source).not.toMatch(/(?:\bpin\s*:\s*string|privateKey|mnemonic|secure-store|async-storage|local-authentication|mnemonicToAccount|privateKeyToAccount|signTransaction|sendTransaction|writeContract|\bfetch\(|\bhttp\()/i);
  });
});
