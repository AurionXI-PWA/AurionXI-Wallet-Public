import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Mainnet private-preview source guard', () => {
  it('does not include an operational Mainnet RPC broadcaster in the preview source tree', () => {
    expect(existsSync(join(process.cwd(), 'src/security/mainnet-rpc-broadcaster.ts'))).toBe(false);
  });

  it('does not let the release policy or local adapter create a network client or broadcast', () => {
    const source = [
      'mainnet-release-security.ts',
      'mainnet-local-signing-adapter.ts',
      'mainnet-broadcast-receipt-coordinator.ts',
      'mainnet-execution-coordinator.ts',
    ].map((file) => readFileSync(join(process.cwd(), 'src/security', file), 'utf8')).join('\n');
    expect(source).not.toMatch(/(?:createWalletClient|sendTransaction|writeContract|eth_sendRawTransaction|\bfetch\(|\bhttp\()/i);
  });
});
