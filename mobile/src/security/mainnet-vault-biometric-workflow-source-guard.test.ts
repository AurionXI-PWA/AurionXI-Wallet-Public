import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Mainnet biometric workflow isolation', () => {
  it('uses Mainnet vault/key/retry adapters and contains no broadcast capability', () => {
    const source = readFileSync(join(process.cwd(), 'src/security/mainnet-vault-biometric-workflow.ts'), 'utf8');
    expect(source).toMatch(/MainnetVault|MainnetBiometric|MainnetPin/);
    expect(source).not.toMatch(/(?:Testnet|bsc-testnet|sendTransaction|writeContract|\bfetch\(|\bhttp\()/i);
  });
});
