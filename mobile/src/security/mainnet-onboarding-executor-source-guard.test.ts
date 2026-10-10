import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Mainnet onboarding executor safety', () => {
  it('uses only Mainnet namespace adapters and has no signing, broadcast, or network execution', () => {
    const source = readFileSync(join(process.cwd(), 'src/security/mainnet-onboarding-executor.ts'), 'utf8');
    expect(source).toMatch(/MainnetVault|MainnetWalletIdentity/);
    expect(source).not.toMatch(/(?:Testnet|bsc-testnet|signTransaction|sendTransaction|writeContract|createWalletClient|\bfetch\(|\bhttp\()/i);
  });
});
