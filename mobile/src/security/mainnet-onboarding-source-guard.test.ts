import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Mainnet onboarding source safety', () => {
  it('does not use Testnet state, read/write vaults, or handle secrets', () => {
    const source = readFileSync(join(process.cwd(), 'src/security/mainnet-onboarding-machine.ts'), 'utf8');
    expect(source).not.toMatch(/(?:bsc-testnet|testnet|secure-store|async-storage|private.?key|mnemonic|recoveryPhrase|signTransaction|sendTransaction|\bfetch\(|\bhttp\()/i);
  });
});
