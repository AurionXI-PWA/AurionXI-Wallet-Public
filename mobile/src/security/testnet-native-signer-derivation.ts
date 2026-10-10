import { entropyToMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';
import { mnemonicToAccount } from 'viem/accounts';

import type { ScopedTestnetSigner, TestnetSigningEnvelope } from './testnet-signing-executor-core';
import { WALLET_KEY_POLICY } from './wallet-key-policy';

/**
 * Creates an in-memory BSC Testnet signer from already-decrypted vault entropy.
 * The caller owns entropy lifetime and must keep the returned signer inside a
 * callback scope. This module has no storage, PIN UI, RPC, or broadcast code.
 */
export function deriveNativeTestnetSignerFromEntropy(entropy: Uint8Array): ScopedTestnetSigner {
  const phrase = entropyToMnemonic(entropy, wordlist);
  const account = mnemonicToAccount(phrase, { path: WALLET_KEY_POLICY.derivationPath });

  return {
    address: account.address,
    signTransaction: (envelope: TestnetSigningEnvelope) => account.signTransaction({
      chainId: envelope.chainId,
      nonce: envelope.nonce,
      to: envelope.to,
      data: envelope.data,
      value: envelope.value,
      gas: envelope.gas,
      gasPrice: envelope.gasPrice,
    }),
  };
}
