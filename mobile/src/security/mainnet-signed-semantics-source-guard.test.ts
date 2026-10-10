import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const mobileNative = resolve(__dirname, '../../android/app/src/main/java/com/aurionxi/wallet/mainnet');
const repository = resolve(__dirname, '../../..');
const repositoryRelayRoot = resolve(repository, 'firebase-functions');
const relayRoot = process.env.AURIONXI_FIREBASE_FUNCTIONS_DIR?.trim()
  ? resolve(process.env.AURIONXI_FIREBASE_FUNCTIONS_DIR)
  : existsSync(repositoryRelayRoot)
    ? repositoryRelayRoot
    : resolve(repository, '..', 'firebase-functions');
const readNative = (name: string) => readFileSync(resolve(mobileNative, name), 'utf8');
const readRelay = (name: string) => readFileSync(resolve(relayRoot, name), 'utf8');

describe('Mainnet signed-transaction semantic parity', () => {
  it('pins only the same ARXI and BSC USDT token contracts on device and relay', () => {
    const native = readNative('MainnetNativeIntentSemanticVerifier.kt').toLowerCase();
    const relay = readRelay('wallet-mainnet-relay-policy.js').toLowerCase();
    expect(native).toContain('0x6ffec4860325f8bfb3f000354708a7d0cae4b250');
    expect(relay).toContain('0x6ffec4860325f8bfb3f000354708a7d0cae4b250');
    expect(relay).toContain('asset !== "native-bnb" && asset !== "arxi"');
    expect(relay).toContain('asset !== "usdt"');
    expect(native).toContain('0x55d398326f99059ff775485246999027b3197955');
    expect(relay).toContain('0x55d398326f99059ff775485246999027b3197955');
    expect(native).toContain('asset.arxi, asset.usdt');
    expect(relay).toContain('transaction.data.tolowercase() !== erc20data');
  });

  it('requires sender recovery, chain 56 and every reviewed transaction field', () => {
    const native = readNative('MainnetNativeIntentSemanticVerifier.kt');
    for (const field of ['senderAddress', 'recipientAddress', 'amountWei', 'nonce', 'gasLimit', 'gasPriceWei']) expect(native).toContain(field);
    expect(native).toContain('decoded.chainId == MAINNET_CHAIN_ID');
    expect(native).toContain('decoded.senderAddress.equals(review.senderAddress');
    expect(native).toContain('transaction.data.equals(erc20TransferData');
  });

  it('rejects unexpected encoding and dangerous transaction shapes', () => {
    const decoder = readNative('MainnetNativeLegacyTransactionVerifier.kt');
    const nativeTests = readFileSync(resolve(repository, 'mobile/android/app/src/test/java/com/aurionxi/wallet/mainnet/MainnetNativeSignedTransactionVerifierTest.kt'), 'utf8');
    const relayTests = readRelay('wallet-mainnet-relay-policy.test.js');
    expect(decoder).toContain('Contract creation is not permitted.');
    expect(decoder).toContain('Non-canonical RLP.');
    expect(decoder).toContain('s <= Sign.CURVE_PARAMS.n.shiftRight(1)');
    for (const evidence of ['approval', 'contract creation', 'typed transaction', 'excessive']) {
      expect(`${nativeTests}\n${relayTests}`.toLowerCase()).toContain(evidence);
    }
  });
});
