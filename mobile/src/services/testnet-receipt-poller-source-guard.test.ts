import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Testnet receipt poller safety', () => {
  it('performs only public receipt reads and contains no signer, credentials, storage, or broadcaster', () => {
    const source = readFileSync(join(process.cwd(), 'src/services/testnet-receipt-poller.ts'), 'utf8');
    expect(source).toContain('getTransactionReceipt');
    expect(source).not.toMatch(/(?:private.?key|mnemonic|createWalletClient|signTransaction|sendTransaction|writeContract|secure-store|async-storage|\bfetch\(|\bhttp\()/i);
  });
});
