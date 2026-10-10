export const WALLET_KEY_POLICY = Object.freeze({
  accountIndex: 0,
  addressIndex: 0,
  bip39EntropyBits: 256,
  bip39GeneratedWordCount: 24,
  bip39ImportWordCounts: Object.freeze([12, 15, 18, 21, 24] as const),
  changeIndex: 0,
  coinType: 60,
  derivationPath: "m/44'/60'/0'/0/0" as const,
  generatedWordlist: 'english' as const,
  passphraseSupportedInBeta: false,
  purpose: 44,
});

export function isSupportedBip39ImportWordCount(wordCount: number): boolean {
  return WALLET_KEY_POLICY.bip39ImportWordCounts.includes(
    wordCount as (typeof WALLET_KEY_POLICY.bip39ImportWordCounts)[number],
  );
}
