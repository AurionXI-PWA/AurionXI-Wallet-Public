import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Mainnet send and sign foundation safety', () => {
  it('contains no key access, signing, broadcast, storage, or network execution', () => {
    const source = ['mainnet-transaction-intent-policy.ts', 'mainnet-fee-readiness.ts', 'mainnet-review-envelope.ts']
      .map((file) => readFileSync(join(process.cwd(), 'src/security', file), 'utf8'))
      .join('\n');
    expect(source).not.toMatch(/(?:private.?key|mnemonic|signTransaction|sendTransaction|writeContract|createWalletClient|secure-store|async-storage|\bfetch\(|\bhttp\()/i);
  });
});
