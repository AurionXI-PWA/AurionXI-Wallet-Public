import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Testnet execution coordinator safety', () => {
  it('requires external approval and contains no signer, client configuration, secret, or storage implementation', () => {
    const source = readFileSync(join(process.cwd(), 'src/security/testnet-execution-coordinator.ts'), 'utf8');
    expect(source).toContain('approval?: ExplicitTestnetBroadcastApproval');
    expect(source).not.toMatch(/(?:createPublicClient|createWalletClient|signTransaction|private.?key|mnemonic|secure-store|async-storage|\bfetch\(|\bhttp\()/i);
  });
});
