import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const recovery = readFileSync(new URL('./mainnet-receipt-recovery.ts', import.meta.url), 'utf8');
const journal = readFileSync(new URL('../storage/mainnet-submission-journal.ts', import.meta.url), 'utf8');

describe('Mainnet receipt recovery source boundary', () => {
  it('cannot broadcast or persist serialized signed bytes', () => {
    expect(recovery).not.toMatch(/sendRawTransaction|eth_sendRawTransaction|\bfetch\s*\(|firebase-broadcaster|one-time-broadcast-handoff|NativeModules/i);
    expect(journal).not.toMatch(/rawTransaction|serializedTransaction|privateKey|mnemonic|recoveryPhrase/i);
  });
});
