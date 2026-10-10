import { describe, expect, it } from 'vitest';
import { mnemonicToAccount } from 'viem/accounts';

import { WALLET_KEY_POLICY } from './wallet-key-policy';

// Public Hardhat/Anvil test vector. It must never be used to hold funds.
const PUBLIC_TEST_MNEMONIC = 'test test test test test test test test test test test junk';

describe('independent EVM key derivation vectors', () => {
  it('derives the known first EVM address at the reviewed path', () => {
    const account = mnemonicToAccount(PUBLIC_TEST_MNEMONIC, {
      path: WALLET_KEY_POLICY.derivationPath,
    });

    expect(account.address).toBe('0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266');
  });

  it('does not collapse adjacent address indexes to the same account', () => {
    const first = mnemonicToAccount(PUBLIC_TEST_MNEMONIC, {
      accountIndex: 0,
      addressIndex: 0,
      changeIndex: 0,
    });
    const second = mnemonicToAccount(PUBLIC_TEST_MNEMONIC, {
      accountIndex: 0,
      addressIndex: 1,
      changeIndex: 0,
    });

    expect(first.address).toBe('0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266');
    expect(second.address).toBe('0x70997970C51812dc3A010C7d01b50e0d17dc79C8');
    expect(second.address).not.toBe(first.address);
  });
});
