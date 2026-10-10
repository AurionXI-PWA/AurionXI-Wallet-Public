import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { MAINNET_DIRECT_PRODUCTION_POLICY as policy } from './mainnet-direct-production-policy';

const androidBuild = readFileSync(resolve(__dirname, '../../android/app/build.gradle'), 'utf8');
const relayPolicyPath = [
  resolve(__dirname, '../../../firebase-functions/wallet-mainnet-production-policy.js'),
  resolve(__dirname, '../../../../firebase-functions/wallet-mainnet-production-policy.js'),
].find(existsSync);
if (!relayPolicyPath) throw new Error('Firebase Mainnet production policy source was not found.');
const relayPolicy = readFileSync(relayPolicyPath, 'utf8');
const normalizedRelayPolicy = relayPolicy.replaceAll('_', '');

describe('Direct Mainnet production policy parity', () => {
  it('pins identical per-transaction limits in TypeScript, native BuildConfig and relay source', () => {
    for (const value of [policy.maxNativeBnbAmountWei, policy.maxArxiAmountWei, policy.maxUsdtAmountWei, policy.maxFeeWei]) {
      expect(androidBuild).toContain(value.toString());
      expect(normalizedRelayPolicy).toContain(`${value}n`);
    }
    expect(androidBuild).toContain('DIRECT_MAINNET_PRODUCTION_ENABLED", "true"');
    expect(relayPolicy).toContain('releaseApproved: true');
  });

  it('pins rolling relay limits to the documented policy', () => {
    expect(normalizedRelayPolicy).toContain(`rollingWindowMs: ${policy.rollingWindowMs}`);
    expect(normalizedRelayPolicy).toContain(`maxTransactionsPerWindow: ${policy.maxTransactionsPerWindow}`);
    for (const value of [policy.maxNativeBnbPerWindowWei, policy.maxArxiPerWindowWei, policy.maxUsdtPerWindowWei]) {
      expect(normalizedRelayPolicy).toContain(`${value}n`);
    }
  });
});
